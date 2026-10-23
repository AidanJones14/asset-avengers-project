package com.avengers.endgame.order;

import com.avengers.endgame.account.*;
import com.avengers.endgame.exception.OrderExceptionHandler;
import com.avengers.endgame.exception.OrderValidationException;
import com.avengers.endgame.holding.*;
import com.avengers.endgame.instrument.*;
import com.avengers.endgame.integration.pricing.client.PricingApiClient;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import com.avengers.endgame.integration.pricing.exception.PricingApiException;
import com.avengers.endgame.order.controller.OrderController;
import com.avengers.endgame.order.domain.*;
import com.avengers.endgame.order.dto.*;
import com.avengers.endgame.order.repository.*;
import com.avengers.endgame.order.service.*;
import com.avengers.endgame.user.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DataAccessException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.http.MediaType;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.jpa.hibernate.ddl-auto=${order.test.ddl-auto:create-drop}", "spring.jpa.open-in-view=false"})
class OrderFlowIntegrationTest {
    @Autowired com.avengers.endgame.bankaccount.BankAccountService banking;
    // Called directly only by the Postgres-only test below. H2 can't run its upsert.
    @Autowired UserProvisioningService provisioning;
    @Autowired com.avengers.endgame.watchlist.WatchlistService watchlists;
    // The seeded client's token. seed() puts it in the SecurityContext so @CurrentUserId resolves in
    // the MockMvc tests (standaloneSetup skips the security filters and the provisioning interceptor).
    private org.springframework.security.oauth2.jwt.Jwt actor;
    @Autowired com.avengers.endgame.instrument.InstrumentService discovery;
    @Autowired OrderService service;
    @Autowired IdempotentOrderService submissions;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;
    @Autowired OrderExecutionService execution;
    @Autowired OrderQuoteService quotes;
    @Autowired OrderRepository orders;
    @Autowired AccountRepository accounts;
    @Autowired HoldingRepository holdings;
    @Autowired InstrumentRepository instruments;
    @Autowired UserRepository users;
    @Autowired TradeFillRepository fills;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean PricingApiClient pricing;
    // The seeded client. OrderService is scoped to the caller, so every call passes this id.
    private UUID userId;
    private UUID accountId;
    private UUID instrumentId;
    private MockMvc mvc;

    @BeforeEach
    void seed() {
        userId = UUID.randomUUID();
        jdbc.update("insert into users (user_id, name, role, created_at) values (?, ?, 'client', CURRENT_TIMESTAMP)", userId, "Test trader");
        Account account = accounts.save(new Account(users.findById(userId).orElseThrow(), decimal("10000")));
        accountId = account.getAccountId();
        actor = org.springframework.security.oauth2.jwt.Jwt.withTokenValue("test").header("alg", "HS256")
                .subject(userId.toString()).claim("email", "test@example.com").claim("roles", java.util.List.of("CLIENT")).build();
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken(actor));
        Instrument instrument = instruments.findBySymbol("AAPL").orElseGet(Instrument::new);
        if (instrument.getInstrumentId() == null) {
            instrument.setInstrumentId(UUID.randomUUID());
        }
        instrumentId = instrument.getInstrumentId();
        instrument.setSymbol("AAPL");
        instrument.setName("Apple");
        instrument.setSecurityType(SecurityType.equity);
        instrument.setActive(true);
        instruments.save(instrument);
        holdings.save(new Holding(accountId, instrumentId, decimal("50")));
        when(pricing.getQuote("AAPL")).thenReturn(quote("50", "50", false, Instant.now()));
        mvc = MockMvcBuilders.standaloneSetup(new OrderController(service, quotes, submissions))
                .setCustomArgumentResolvers(new org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver())
                .setControllerAdvice(new OrderExceptionHandler()).build();
    }

    @org.junit.jupiter.api.AfterEach
    void clearActor() { org.springframework.security.core.context.SecurityContextHolder.clearContext(); }

    @Test
    void submissionKeyReplaysTheOriginalOrderEvenAfterItsStatusChanges() {
        UUID key = UUID.randomUUID();
        var request = request(OrderSide.buy, OrderType.limit, "2", "50", null);
        var first = submissions.create(userId, key, request);
        var retry = submissions.create(userId, key, request);
        assertEquals(first.orderId(), retry.orderId());
        assertEquals(1, orders.findByAccountId(accountId).size());
        assertEquals(1, jdbc.queryForObject("select count(*) from order_submission_keys where user_id = ?", Integer.class, userId));
        service.cancelOrder(userId, first.orderId());
        assertEquals(OrderStatus.cancelled, submissions.create(userId, key, request).status());
        assertBalances("10000", "50");
    }

    @Test
    void submissionKeyCannotBeReusedForDifferentDetails() {
        UUID key = UUID.randomUUID();
        submissions.create(userId, key, request(OrderSide.buy, OrderType.limit, "2", "50", null));
        var conflict = assertThrows(org.springframework.web.server.ResponseStatusException.class, () ->
                submissions.create(userId, key, request(OrderSide.buy, OrderType.limit, "3", "50", null)));
        assertEquals(409, conflict.getStatusCode().value());
        assertEquals(1, orders.findByAccountId(accountId).size());
        assertBalances("10000", "50");
    }

    @Test
    void equivalentDecimalScalesAndTickerCaseReplayTheSameOrder() {
        UUID key = UUID.randomUUID();
        var first = new OrderRequestDto(accountId, instrumentId, "aapl", OrderType.limit, OrderSide.buy,
                decimal("2.0000"), decimal("50.0000"), null);
        var retry = new OrderRequestDto(accountId, instrumentId, " AAPL ", OrderType.limit, OrderSide.buy,
                decimal("2"), decimal("50"), null);
        assertEquals(submissions.create(userId, key, first).orderId(), submissions.create(userId, key, retry).orderId());
        assertEquals(1, orders.findByAccountId(accountId).size());
    }

    @Test
    void failedValidationDoesNotConsumeAKey() {
        UUID key = UUID.randomUUID();
        assertThrows(RuntimeException.class, () -> submissions.create(userId, key,
                request(OrderSide.buy, OrderType.limit, "0", "50", null)));
        assertEquals(0, jdbc.queryForObject("select count(*) from order_submission_keys where user_id = ?", Integer.class, userId));
        var result = submissions.create(userId, key, request(OrderSide.buy, OrderType.limit, "1", "50", null));
        assertEquals(OrderStatus.accepted, result.status());
        assertEquals(1, orders.findByAccountId(accountId).size());
    }

    @Test
    void rollbackRemovesBothOrderAndSubmissionKey() {
        UUID key = UUID.randomUUID();
        var request = request(OrderSide.buy, OrderType.limit, "1", "50", null);
        new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            submissions.create(userId, key, request);
            status.setRollbackOnly();
        });
        assertEquals(0, orders.findByAccountId(accountId).size());
        assertEquals(0, jdbc.queryForObject("select count(*) from order_submission_keys where user_id = ?", Integer.class, userId));
        assertEquals(OrderStatus.accepted, submissions.create(userId, key, request).status());
        assertEquals(1, orders.findByAccountId(accountId).size());
    }

    @Test
    void submissionKeysAreScopedToTheAuthenticatedUser() {
        UUID key = UUID.randomUUID();
        var first = submissions.create(userId, key, request(OrderSide.buy, OrderType.limit, "1", "50", null));
        seed(); // Another identity/account using the same externally supplied key.
        var second = submissions.create(userId, key, request(OrderSide.buy, OrderType.limit, "1", "50", null));
        assertNotEquals(first.orderId(), second.orderId());
        assertEquals(accountId, second.accountId());
    }

    @Test
    void concurrentRetriesCreateOneOrderAndOneFill() throws Exception {
        UUID caller = userId;
        UUID key = UUID.randomUUID();
        var request = request(OrderSide.buy, OrderType.limit, "2", "50", null);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        Callable<com.avengers.endgame.order.dto.OrderResponseDto> submit = () -> {
            ready.countDown();
            if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Start timeout");
            return submissions.create(caller, key, request);
        };
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(submit);
            var second = pool.submit(submit);
            assertTrue(ready.await(10, TimeUnit.SECONDS)); start.countDown();
            var id = first.get(30, TimeUnit.SECONDS).orderId();
            assertEquals(id, second.get(30, TimeUnit.SECONDS).orderId());
            assertEquals(1, orders.findByAccountId(accountId).size());
            execution.executeOrder(id); execution.executeOrder(id);
            assertFilled(id, "50", "100");
            assertBalances("9900", "52");
            assertEquals(1, jdbc.queryForObject("select count(*) from trade_fills where order_id = ?", Integer.class, id));
        }
    }

    @Test
    void httpSubmissionReusesHeaderAndRejectsInvalidKeys() throws Exception {
        UUID key = UUID.randomUUID();
        String body = "{\"accountId\":\"" + accountId + "\",\"instrumentId\":\"" + instrumentId
                + "\",\"orderType\":\"limit\",\"orderSide\":\"buy\",\"quantity\":1,\"limitPrice\":50}";
        var first = mvc.perform(post("/api/v1/orders").header("Idempotency-Key", key)
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated()).andReturn();
        mvc.perform(post("/api/v1/orders").header("Idempotency-Key", key)
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.orderId").value(new tools.jackson.databind.ObjectMapper()
                        .readTree(first.getResponse().getContentAsString()).get("orderId").asText()));
        mvc.perform(post("/api/v1/orders").header("Idempotency-Key", "not-a-uuid")
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        assertEquals(1, orders.findByAccountId(accountId).size());
    }

    @Test
    void quoteEvidencePreservesSubmissionAndExecutionObservations() {
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.market, "1", null, null));
        when(pricing.getQuote("AAPL")).thenReturn(quote("51", "52", true, Instant.now().minusSeconds(86400)));
        execution.executeOrder(order.orderId());
        assertEquals(2, jdbc.queryForObject(
                "select count(*) from order_pricing_evidence where order_id = ?", Integer.class, order.orderId()));
        String executionQuote = jdbc.queryForObject(
                "select quote_json from order_pricing_evidence where order_id = ? and phase = 'execution'",
                String.class, order.orderId());
        assertTrue(executionQuote.contains("\"stale\":true"));
        assertTrue(executionQuote.contains("\"ask\":52"));
    }

    @Test
    void invalidExecutionQuoteKeepsAnAttemptRecordAfterRollback() {
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.market, "1", null, null));
        when(pricing.getQuote("AAPL")).thenReturn(quote("51", "52", false, Instant.now().plusSeconds(3600)));
        assertThrows(RuntimeException.class, () -> execution.executeOrder(order.orderId()));
        assertEquals(OrderStatus.accepted, service.getOrderById(userId, order.orderId()).status());
        assertEquals(1, jdbc.queryForObject(
                "select count(*) from order_pricing_evidence where order_id = ? and decision = 'rejected'",
                Integer.class, order.orderId()));
        assertMoney("10000", accounts.findById(accountId).orElseThrow().getCashBalance());
    }

    @Test
    void lookupPersistsAnUnknownTickerAndDirectTradeUsesTheSameInstrument() {
        String symbol = "ZXNEWSTOCK";
        var market = new QuoteResponse(symbol, decimal("50"), decimal("49"), decimal("50"), null,
                "USD", null, null, null, Instant.now(), "OPEN", false, "test");
        when(pricing.getQuote(symbol)).thenReturn(market);
        var found = discovery.getInstrumentBySymbol(" zxnewstock ");
        assertEquals(symbol, found.symbol());
        assertEquals(found.instrumentId(), discovery.getInstrumentBySymbol(symbol).instrumentId());
        assertTrue(instruments.findBySymbol(symbol).isPresent());
        var order = service.createOrder(userId, new OrderRequestDto(accountId, null, symbol,
                OrderType.market, OrderSide.buy, decimal("1"), null, null));
        assertEquals(found.instrumentId(), order.instrumentId());
        execution.executeOrder(order.orderId());
        assertEquals(OrderStatus.filled, service.getOrderById(userId, order.orderId()).status());
        assertMoney("1", holdings.findByAccountIdAndInstrumentId(accountId, found.instrumentId()).orElseThrow().getQuantity());
    }

    @Test
    void directTradeDiscoversAndSavesTheInstrumentWithoutAPriorLookup() {
        String symbol = "ZXDIRECT";
        when(pricing.getQuote(symbol)).thenReturn(new QuoteResponse(symbol, decimal("50"), decimal("49"), decimal("50"), null,
                "USD", null, null, null, Instant.now(), "OPEN", false, "test"));
        var order = service.createOrder(userId, new OrderRequestDto(accountId, null, symbol,
                OrderType.market, OrderSide.buy, decimal("1"), null, null));
        assertEquals(instruments.findBySymbol(symbol).orElseThrow().getInstrumentId(), order.instrumentId());
    }

    @Test
    void concurrentDiscoveryCreatesOnlyOneInstrument() throws Exception {
        String symbol = "ZXCONCUR";
        when(pricing.getQuote(symbol)).thenReturn(new QuoteResponse(symbol, decimal("50"), decimal("49"), decimal("50"), null,
                "USD", null, null, null, Instant.now(), "OPEN", false, "test"));
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> discovery.getInstrumentBySymbol(symbol));
            var second = pool.submit(() -> discovery.getInstrumentBySymbol(symbol.toLowerCase()));
            assertEquals(first.get(10, TimeUnit.SECONDS).instrumentId(), second.get(10, TimeUnit.SECONDS).instrumentId());
        }
        assertEquals(1, instruments.findAll().stream().filter(instrument -> symbol.equals(instrument.getSymbol())).count());
        verify(pricing, times(1)).getQuote(symbol);
    }

    @Test
    void invalidPricingDoesNotSaveAMadeUpTicker() {
        when(pricing.getQuote("ZXINVALID")).thenThrow(new PricingApiException("not found"));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> discovery.getInstrumentBySymbol("ZXINVALID"));
        assertTrue(instruments.findBySymbol("ZXINVALID").isEmpty());
    }

    // The watchlist and the trading-account snapshot are keyed by the caller's userId (what
    // @CurrentUserId hands the controllers). Starring twice keeps one entry, unstarring removes it,
    // and none of it touches the cash balance.
    @Test
    void watchlistChangesAreKeyedByTheCallerAndLeaveTheBalanceAlone() {
        balance("12345");
        watchlists.change(userId, "AAPL", true);
        assertEquals(java.util.List.of("AAPL"), banking.getTradingAccount(userId).watchedSymbols());
        watchlists.change(userId, "AAPL", true);
        assertEquals(1, watchlists.symbols(userId).size());
        watchlists.change(userId, "AAPL", false);
        assertTrue(watchlists.symbols(userId).isEmpty());
        assertMoney("12345", banking.getTradingAccount(userId).cashBalance());
    }

    // Formerly "login restores the account". Provisioning now runs on every request, so running it
    // again must keep the client's existing account and balance, never open or reset one.
    // Postgres only: H2 rejects the provisioning upsert (ON CONFLICT ... DO UPDATE).
    @Test
    @EnabledIfSystemProperty(named = "order.test.jdbc-driver", matches = "org\\.postgresql\\.Driver")
    void repeatedProvisioningKeepsTheClientsAccountAndBalance() {
        // 1. The seeded client already has a funded account.
        balance("12345");
        // 2. Two requests' worth of provisioning, from a token without names.
        String email = userId + "@example.com";
        provisioning.provision(userId, email, UserRole.client, null, null);
        provisioning.provision(userId, email, UserRole.client, null, null);
        // 3. Still exactly one account: the same one, with the same cash.
        var owned = accounts.findByUserUserId(userId);
        assertEquals(1, owned.size());
        assertEquals(accountId, owned.getFirst().getAccountId());
        assertMoney("12345", owned.getFirst().getCashBalance());
        // 4. The users row now carries the token's email (the seed inserted none).
        assertEquals(email, users.findById(userId).orElseThrow().getEmail());
    }

    // A new auth identity that reuses an old email gets its own empty account. It never inherits the old
    // identity's portfolio: ownership follows the token's sub, never the email (users.email isn't unique;
    // auth-server owns email uniqueness).
    // Postgres only: H2 rejects the provisioning upsert.
    @Test
    @EnabledIfSystemProperty(named = "order.test.jdbc-driver", matches = "org\\.postgresql\\.Driver")
    void reusedEmailDoesNotInheritPreviousIdentityPortfolio() {
        // 1. An old identity with this email owns a funded account.
        UUID oldId = UUID.randomUUID();
        UUID newId = UUID.randomUUID();
        String email = "reset-" + UUID.randomUUID() + "@example.invalid";
        jdbc.update("INSERT INTO users (user_id, email, role) VALUES (?, ?, 'client')", oldId, email);
        Account oldAccount = accounts.save(new Account(users.findById(oldId).orElseThrow(), decimal("1234")));
        // 2. The new identity's first request: provisioning opens a separate, empty account for it.
        provisioning.provision(newId, email, UserRole.client, null, null);
        Account newAccount = accounts.findByUserUserId(newId).getFirst();
        assertNotEquals(oldAccount.getAccountId(), newAccount.getAccountId());
        assertMoney("0", newAccount.getCashBalance());
        // 3. The old account keeps its cash, and bank accounts stay with the identity that linked them.
        assertMoney("1234", accounts.findById(oldAccount.getAccountId()).orElseThrow().getCashBalance());
        banking.createBankAccount(newId, new com.avengers.endgame.bankaccount.CreateBankAccountRequestDto(
                "Test bank", "123456789", "1234567890", "1234567890"));
        assertEquals(1, banking.getUserBankAccounts(newId).size());
        assertTrue(banking.getUserBankAccounts(oldId).isEmpty());
        // 4. Later requests keep that same one account.
        provisioning.provision(newId, email, UserRole.client, null, null);
        assertEquals(1, accounts.findByUserUserId(newId).size());
        assertEquals(newAccount.getAccountId(), accounts.findByUserUserId(newId).getFirst().getAccountId());
    }

    // The token's first and last name are copied into the users row (staff search reads them through the
    // reporting pipeline). A token without names keeps the stored ones; changed names replace them.
    // Postgres only: H2 rejects the provisioning upsert.
    @Test
    @EnabledIfSystemProperty(named = "order.test.jdbc-driver", matches = "org\\.postgresql\\.Driver")
    void provisioningCopiesTheTokensNames_andATokenWithoutNamesKeepsThem() {
        String email = userId + "@example.com";
        // 1. A token with names: first_name, last_name and the full name are stored.
        provisioning.provision(userId, email, UserRole.client, "Caméron", "O’Kelly");
        User named = users.findById(userId).orElseThrow();
        assertEquals("Caméron", named.getFirstName());
        assertEquals("O’Kelly", named.getLastName());
        assertEquals("Caméron O’Kelly", named.getName());
        // 2. An older token without names changes nothing.
        provisioning.provision(userId, email, UserRole.client, null, null);
        assertEquals("Caméron O’Kelly", users.findById(userId).orElseThrow().getName());
        // 3. New names (e.g. edited in auth-server) replace the stored ones.
        provisioning.provision(userId, email, UserRole.client, "Cameron", "Kelly");
        User renamed = users.findById(userId).orElseThrow();
        assertEquals("Cameron", renamed.getFirstName());
        assertEquals("Kelly", renamed.getLastName());
        assertEquals("Cameron Kelly", renamed.getName());
    }

    // Withdrawing more than the available cash is the caller's problem, not a server error:
    // spec 422 with code INSUFFICIENT_CASH (it used to be an IllegalArgumentException, i.e. a 500).
    @Test
    void withdrawingMoreThanTheAvailableCash_is422InsufficientCash_andChangesNothing() {
        // 1. The seeded client links a bank account. Their trading account holds 10000.
        var bank = banking.createBankAccount(userId, new com.avengers.endgame.bankaccount.CreateBankAccountRequestDto(
                "Test Bank", "021000021", "123456789", "123456789"));
        // 2. Ask for more than that.
        var refused = assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> banking.withdraw(userId, new com.avengers.endgame.bankaccount.DepositWithdrawalRequestDto(
                        bank.bankAccountId(), decimal("10000.01"), accountId)));
        // 3. 422 with the spec's code, which OrderExceptionHandler keeps, and the balance is untouched.
        assertEquals(422, refused.getStatusCode().value());
        assertEquals("INSUFFICIENT_CASH", refused.getBody().getProperties().get("code"));
        assertMoney("10000", accounts.findById(accountId).orElseThrow().getCashBalance());
    }

    @Test
    void withdrawalDebitsOnlyTheExplicitlySelectedOwnedAccount() {
        var selected = accounts.save(new Account(users.findById(userId).orElseThrow(),
                "Retirement", "Roth IRA", decimal("200")));
        var bank = banking.createBankAccount(userId, new com.avengers.endgame.bankaccount.CreateBankAccountRequestDto(
                "Test Bank", "021000021", "123456789", "123456789"));
        banking.withdraw(userId, new com.avengers.endgame.bankaccount.DepositWithdrawalRequestDto(
                bank.bankAccountId(), decimal("50"), selected.getAccountId()));
        assertMoney("150", accounts.findById(selected.getAccountId()).orElseThrow().getCashBalance());
        assertMoney("10000", accounts.findById(accountId).orElseThrow().getCashBalance());
        assertMoney("50", jdbc.queryForObject("select amount from transactions where account_id = ?",
                BigDecimal.class, selected.getAccountId()));
    }

    @Test
    void withdrawalRequiresAnExplicitInvestmentAccount() {
        var bank = banking.createBankAccount(userId, new com.avengers.endgame.bankaccount.CreateBankAccountRequestDto(
                "Test Bank", "021000021", "123456789", "123456789"));
        var refused = assertThrows(org.springframework.web.server.ResponseStatusException.class, () ->
                banking.withdraw(userId, new com.avengers.endgame.bankaccount.DepositWithdrawalRequestDto(
                        bank.bankAccountId(), decimal("10"), null)));
        assertEquals(400, refused.getStatusCode().value());
        assertMoney("10000", accounts.findById(accountId).orElseThrow().getCashBalance());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void withdrawalRejectsForeignAndDeactivatedInvestmentAccounts(boolean deactivated) {
        UUID ownerId = userId;
        if (!deactivated) {
            ownerId = UUID.randomUUID();
            jdbc.update("insert into users (user_id, name, role, created_at) values (?, ?, 'client', CURRENT_TIMESTAMP)",
                    ownerId, "Other trader");
        }
        var selected = new Account(users.findById(ownerId).orElseThrow(), decimal("200"));
        selected.setDeactivated(deactivated);
        selected = accounts.save(selected);
        UUID selectedId = selected.getAccountId();
        var bank = banking.createBankAccount(userId, new com.avengers.endgame.bankaccount.CreateBankAccountRequestDto(
                "Test Bank", "021000021", "123456789", "123456789"));
        var refused = assertThrows(org.springframework.web.server.ResponseStatusException.class, () ->
                banking.withdraw(userId, new com.avengers.endgame.bankaccount.DepositWithdrawalRequestDto(
                        bank.bankAccountId(), decimal("10"), selectedId)));
        assertEquals(404, refused.getStatusCode().value());
        assertMoney("200", accounts.findById(selectedId).orElseThrow().getCashBalance());
        assertMoney("10000", accounts.findById(accountId).orElseThrow().getCashBalance());
    }

    @Test
    void withdrawalCannotSpendTheSelectedAccountsReservedCash() {
        service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "2", "50", null));
        var bank = banking.createBankAccount(userId, new com.avengers.endgame.bankaccount.CreateBankAccountRequestDto(
                "Test Bank", "021000021", "123456789", "123456789"));
        var refused = assertThrows(org.springframework.web.server.ResponseStatusException.class, () ->
                banking.withdraw(userId, new com.avengers.endgame.bankaccount.DepositWithdrawalRequestDto(
                        bank.bankAccountId(), decimal("9901"), accountId)));
        assertEquals(422, refused.getStatusCode().value());
        assertMoney("10000", accounts.findById(accountId).orElseThrow().getCashBalance());
    }

    // Mismatched account numbers are the caller's mistake: 400 (it used to be a 500).
    @Test
    void linkingABankAccountWithMismatchedNumbers_is400() {
        var refused = assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> banking.createBankAccount(userId, new com.avengers.endgame.bankaccount.CreateBankAccountRequestDto(
                        "Test Bank", "021000021", "123456789", "987654321")));
        assertEquals(400, refused.getStatusCode().value());
        assertEquals("Account numbers do not match", refused.getReason());
    }

    @Test
    void anotherUserCannotSubmitOrdersForThisAccount() throws Exception {
        UUID other = UUID.randomUUID();
        jdbc.update("insert into users (user_id, name, role, created_at) values (?, ?, 'client', CURRENT_TIMESTAMP)", other, "Other trader");
        var otherActor = org.springframework.security.oauth2.jwt.Jwt.withTokenValue("other").header("alg", "HS256")
                .subject(other.toString()).claim("email", "other@example.com").claim("roles", java.util.List.of("CLIENT")).build();
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken(otherActor));
        mvc.perform(post("/api/v1/orders").contentType(MediaType.APPLICATION_JSON).content(
                "{\"accountId\":\"" + accountId + "\",\"symbol\":\"AAPL\",\"orderType\":\"market\",\"orderSide\":\"buy\",\"quantity\":1}"))
                .andExpect(status().isNotFound()); // spec: another client's account is 404, not 403
        assertTrue(watchlists.symbols(other).isEmpty());
    }

    @Test
    void bankingBalanceIdentifiesTheFundedTradingAccount() {
        var account = accounts.findById(accountId).orElseThrow();
        var response = banking.getTradingAccount(account.getUser().getUserId());
        assertEquals(accountId, response.accountId());
        assertMoney("10000", response.cashBalance());
    }

    @Test
    void depositingFundsUpdatesTheSelectedInvestmentAccount() {
        var bank = banking.createBankAccount(userId, new com.avengers.endgame.bankaccount.CreateBankAccountRequestDto(
                "Test Bank", "021000021", "123456789", "123456789"));
        var secondAccount = accounts.save(new Account(users.findById(userId).orElseThrow(),
                "Retirement", "Roth IRA", decimal("0")));

        banking.deposit(userId, new com.avengers.endgame.bankaccount.DepositWithdrawalRequestDto(
                bank.bankAccountId(), decimal("250"), secondAccount.getAccountId()));

        assertMoney("10000", accounts.findById(accountId).orElseThrow().getCashBalance());
        assertMoney("250", accounts.findById(secondAccount.getAccountId()).orElseThrow().getCashBalance());
        assertEquals(1, jdbc.queryForObject(
                "select count(*) from transactions where account_id = ? and txn_type = 'deposit'",
                Integer.class, secondAccount.getAccountId()));
    }

    @Test
    void portfolioSnapshotReturnsHoldingsForTheSelectedInvestmentAccount() {
        var secondAccount = accounts.save(new Account(users.findById(userId).orElseThrow(),
                "Retirement", "Roth IRA", decimal("500")));
        holdings.save(new Holding(secondAccount.getAccountId(), instrumentId, decimal("7")));

        var snapshot = banking.getTradingAccount(userId, secondAccount.getAccountId());

        assertEquals(secondAccount.getAccountId(), snapshot.accountId());
        assertMoney("500", snapshot.cashBalance());
        assertEquals(1, snapshot.holdings().size());
        assertMoney("7", snapshot.holdings().getFirst().quantity());
        assertEquals(accountId, banking.getTradingAccount(userId).accountId());
    }

    @Test
    void snapshotTracksReservationsAndBothBuyAndSellFills() {
        var userId = accounts.findById(accountId).orElseThrow().getUser().getUserId();
        var buy = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "2", "50", null));
        var accepted = banking.getTradingAccount(userId);
        assertMoney("10000", accepted.cashBalance());
        assertMoney("9900", accepted.availableCash());
        assertMoney("50", accepted.holdings().getFirst().quantity());
        execution.executeOrder(buy.orderId());
        var bought = banking.getTradingAccount(userId);
        assertMoney("9900", bought.cashBalance());
        assertMoney("9900", bought.availableCash());
        assertMoney("52", bought.holdings().getFirst().quantity());
        assertEquals(OrderStatus.filled, bought.orders().stream()
                .filter(order -> order.orderId().equals(buy.orderId())).findFirst().orElseThrow().status());
        var sell = service.createOrder(userId, request(OrderSide.sell, OrderType.market, "2", null, null));
        execution.executeOrder(sell.orderId());
        var sold = banking.getTradingAccount(userId);
        assertMoney("10000", sold.availableCash());
        assertMoney("50", sold.holdings().getFirst().quantity());
    }

    @Test
    void snapshotRestoresSeparatePurchasesAndWeightedAverageAfterSelling() {
        var initial = holdings.findByAccountId(accountId).getFirst();
        initial.setQuantity(BigDecimal.ZERO);
        holdings.save(initial);
        var userId = accounts.findById(accountId).orElseThrow().getUser().getUserId();
        when(pricing.getQuote("AAPL")).thenReturn(quote("190", "190.42", true, Instant.now()));
        var first = service.createOrder(userId, request(OrderSide.buy, OrderType.market, "1", null, null));
        execution.executeOrder(first.orderId());
        when(pricing.getQuote("AAPL")).thenReturn(quote("198", "198.20", true, Instant.now()));
        var second = service.createOrder(userId, request(OrderSide.buy, OrderType.market, "1", null, null));
        execution.executeOrder(second.orderId());
        var position = banking.getTradingAccount(userId).holdings().getFirst();
        assertMoney("2", position.quantity());
        assertMoney("194.31", position.averageCost());
        assertEquals(2, position.purchases().size());
        assertTrue(position.purchases().stream().anyMatch(p -> p.pricePaid().compareTo(decimal("190.42")) == 0
                && p.totalCost().compareTo(decimal("190.42")) == 0 && p.acquiredAt() != null && p.fillId() != null));
        assertTrue(position.purchases().stream().anyMatch(p -> p.pricePaid().compareTo(decimal("198.20")) == 0));
        // A later snapshot reloads the saved fills rather than relying on browser history.
        assertEquals(position.purchases(), banking.getTradingAccount(userId).holdings().getFirst().purchases());
        var sell = service.createOrder(userId, request(OrderSide.sell, OrderType.market, "1", null, null));
        execution.executeOrder(sell.orderId());
        var remaining = banking.getTradingAccount(userId).holdings().getFirst();
        assertMoney("1", remaining.quantity());
        assertMoney("194.31", remaining.averageCost());
        assertEquals(2, remaining.purchases().size());
        assertMoney("3.69", banking.getTradingAccount(userId).realizedReturn());
    }

    @Test
    void recordsAcceptedCommitmentBeforeExecutionWithoutChangingBalances() {
        var response = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "30", "50", null));
        assertEquals(OrderStatus.accepted, response.status());
        assertNull(response.price());
        assertNull(response.finalizedAt());
        assertMoney("1500", orders.findById(response.orderId()).orElseThrow().getReservedCash());
        assertBalances("10000", "50");
        assertTrue(fills.findByOrderId(response.orderId()).isEmpty());
        verifyNoInteractions(pricing); // A limit commitment does not depend on market-data availability.
    }

    @Test
    void fillsBuyAtExecutionAskInsteadOfSubmissionEstimate() {
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.market, "30", null, null));
        when(pricing.getQuote("AAPL")).thenReturn(quote("49", "51", false, Instant.now()));
        execution.executeOrder(order.orderId());
        assertBalances("8470", "80");
        assertFilled(order.orderId(), "51", "1530");
    }

    @Test
    void fillsSellAtBidAndRecordsAllThreeChanges() {
        var order = service.createOrder(userId, request(OrderSide.sell, OrderType.market, "30", null, null));
        when(pricing.getQuote("AAPL")).thenReturn(quote("49", "51", false, Instant.now()));
        execution.executeOrder(order.orderId());
        assertBalances("11470", "20");
        assertFilled(order.orderId(), "49", "1470");
    }

    @Test
    void rejectsInsufficientCashAndReservesAcrossInstruments() {
        balance("1500");
        service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "30", "50", null));
        Instrument other = instruments.findBySymbol("MSFT").orElseGet(Instrument::new);
        if (other.getInstrumentId() == null) {
            other.setInstrumentId(UUID.randomUUID());
        }
        other.setSymbol("MSFT");
        other.setName("Microsoft");
        other.setSecurityType(SecurityType.equity);
        instruments.save(other);
        var rejected = service.createOrder(userId, new OrderRequestDto(
                accountId, other.getInstrumentId(), OrderType.limit, OrderSide.buy, BigDecimal.ONE, decimal("1"), null));
        assertEquals(OrderStatus.rejected,rejected.status());
        assertEquals("Insufficient available cash",rejected.rejectionReason());
        assertEquals(2,orders.findByAccountId(accountId).size());
        assertEquals(0,orders.findById(rejected.orderId()).orElseThrow().getReservedCash().signum());
        assertTrue(fills.findByAccountIdOrderByExecutedAtAsc(accountId).isEmpty());
        assertMoney("1500",accounts.findById(accountId).orElseThrow().getCashBalance());
    }

    @Test
    @EnabledIfSystemProperty(named = "order.test.jdbc-driver", matches = "org\\.postgresql\\.Driver")
    void insufficientCashPersistsBothLifecycleEventsWithoutMovingMoney() {
        balance("1");
        var rejected=service.createOrder(userId, request(OrderSide.buy, OrderType.market, "2", null, null));
        assertEquals(OrderStatus.rejected,rejected.status());
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM order_audit_events WHERE order_id=?",Integer.class,rejected.orderId()));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM cash_ledger WHERE order_id=?",Integer.class,rejected.orderId()));
        assertMoney("1",accounts.findById(accountId).orElseThrow().getCashBalance());
        assertMoney("50",holdings.findByAccountIdAndInstrumentId(accountId,instrumentId).orElseThrow().getQuantity());
    }

    @Test
    void rejectsOversellingAndCancellationReleasesShares() {
        var order = service.createOrder(userId, request(OrderSide.sell, OrderType.limit, "50", "50", null));
        assertThrows(OrderValidationException.class,
                () -> service.createOrder(userId, request(OrderSide.sell, OrderType.limit, "1", "50", null)));
        service.cancelOrder(userId, order.orderId());
        assertDoesNotThrow(() -> service.createOrder(userId, request(OrderSide.sell, OrderType.limit, "50", "50", null)));
        assertBalances("10000", "50");
    }

    @Test
    void rejectsSellWithoutHolding() {
        holdings.deleteAll(holdings.findByAccountId(accountId));
        assertThrows(OrderValidationException.class,
                () -> service.createOrder(userId, request(OrderSide.sell, OrderType.market, "1", null, null)));
    }

    @Test
    void cancellationReleasesCashAndCannotExecute() {
        balance("1500");
        var original = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "30", "50", null));
        service.cancelOrder(userId, original.orderId());
        execution.executeOrder(original.orderId());
        assertTrue(fills.findByOrderId(original.orderId()).isEmpty());
        var replacement = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "30", "50", null));
        execution.executeOrder(replacement.orderId());
        assertBalances("0", "80");
    }

    @Test
    void repricingUsesOwnReservationAndFailedUpdateLeavesOrderUnchanged() {
        balance("1600");
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "30", "50", null));
        assertMoney("51", service.updatePrice(userId, order.orderId(), decimal("51")).limitPrice());
        assertThrows(OrderValidationException.class, () -> service.updatePrice(userId, order.orderId(), decimal("54")));
        Order persisted = orders.findById(order.orderId()).orElseThrow();
        assertMoney("51", persisted.getLimitPrice());
        assertMoney("1530", persisted.getReservedCash());
        assertNull(persisted.getPrice());
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"0", "-1", "0.00001"})
    void rejectsInvalidPriceEdits(String price) {
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "1", "50", null));
        assertThrows(OrderValidationException.class, () -> service.updatePrice(userId, order.orderId(), decimal(price)));
        assertMoney("50", service.getOrderById(userId, order.orderId()).limitPrice());
    }

    @Test
    void rejectsUnaffordableExecutionAfterPriceMovesAndReleasesReservation() {
        balance("1500");
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.market, "30", null, null));
        when(pricing.getQuote("AAPL")).thenReturn(quote("50", "51", false, Instant.now()));
        execution.executeOrder(order.orderId());
        var response = service.getOrderById(userId, order.orderId());
        assertEquals(OrderStatus.rejected, response.status());
        assertEquals("Insufficient available cash at execution price", response.rejectionReason());
        assertMoney("0", orders.findById(order.orderId()).orElseThrow().getReservedCash());
        assertTrue(fills.findByOrderId(order.orderId()).isEmpty());
        assertBalances("1500", "50");
    }

    @Test
    void executionCannotSpendCashCommittedToAnotherOrder() {
        balance("1500");
        var first = service.createOrder(userId, request(OrderSide.buy, OrderType.market, "20", null, null));
        var second = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "10", "50", null));
        when(pricing.getQuote("AAPL")).thenReturn(quote("50", "51", false, Instant.now()));
        execution.executeOrder(first.orderId());
        assertEquals(OrderStatus.rejected, service.getOrderById(userId, first.orderId()).status());
        assertEquals(OrderStatus.accepted, service.getOrderById(userId, second.orderId()).status());
        assertBalances("1500", "50");
    }

    @Test
    void limitWaitsThenReceivesPriceImprovement() {
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "30", "49", null));
        execution.executeOrder(order.orderId());
        assertEquals(OrderStatus.accepted, service.getOrderById(userId, order.orderId()).status());
        when(pricing.getQuote("AAPL")).thenReturn(quote("47", "48", false, Instant.now()));
        execution.executeOrder(order.orderId());
        assertFilled(order.orderId(), "48", "1440");
    }

    @Test
    void waitingLimitOnDeactivatedInstrumentIsRejectedInsteadOfDeferredForever() {
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "30", "40", null));
        Instrument instrument = instruments.findById(instrumentId).orElseThrow();
        instrument.setActive(false);
        instruments.save(instrument);
        assertFalse(execution.shouldWaitForQuote(orders.findById(order.orderId()).orElseThrow()));
        execution.executeOrder(order.orderId());
        var response = service.getOrderById(userId, order.orderId());
        assertEquals(OrderStatus.rejected, response.status());
        assertEquals("Account or instrument is no longer eligible to trade", response.rejectionReason());
        assertMoney("0", orders.findById(order.orderId()).orElseThrow().getReservedCash());
        assertBalances("10000", "50");
    }

    @Test
    void sellLimitWaitsUntilBidReachesLimit() {
        var order = service.createOrder(userId, request(OrderSide.sell, OrderType.limit, "30", "51", null));
        execution.executeOrder(order.orderId());
        assertEquals(OrderStatus.accepted, service.getOrderById(userId, order.orderId()).status());
        when(pricing.getQuote("AAPL")).thenReturn(quote("52", "53", false, Instant.now()));
        execution.executeOrder(order.orderId());
        assertFilled(order.orderId(), "52", "1560");
    }

    @Test
    void stopBuyWaitsForTriggerAndUsesCurrentAsk() {
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.stop, "1", null, "51"));
        execution.executeOrder(order.orderId());
        assertEquals(OrderStatus.accepted, service.getOrderById(userId, order.orderId()).status());
        when(pricing.getQuote("AAPL")).thenReturn(quote("51", "52", false, Instant.now()));
        execution.executeOrder(order.orderId());
        assertFilled(order.orderId(), "52", "52");
    }

    @Test
    void stopLimitRetainsTriggerAcrossPolls() {
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.stop_limit, "1", "52", "51"));
        when(pricing.getQuote("AAPL")).thenReturn(quote("52", "53", false, Instant.now()));
        execution.executeOrder(order.orderId());
        assertTrue(orders.findById(order.orderId()).orElseThrow().isStopTriggered());
        assertEquals(OrderStatus.accepted, service.getOrderById(userId, order.orderId()).status());
        when(pricing.getQuote("AAPL")).thenReturn(quote("49", "50", false, Instant.now()));
        execution.executeOrder(order.orderId());
        assertFilled(order.orderId(), "50", "50");
    }

    @Test
    void stopSellWaitsUntilBidFallsToTriggerAndUsesCurrentBid() {
        var order = service.createOrder(userId, request(OrderSide.sell, OrderType.stop, "10", null, "45"));
        execution.executeOrder(order.orderId());
        assertEquals(OrderStatus.accepted, service.getOrderById(userId, order.orderId()).status());
        when(pricing.getQuote("AAPL")).thenReturn(quote("44", "44.5", false, Instant.now()));
        execution.executeOrder(order.orderId());
        assertFilled(order.orderId(), "44", "440");
    }

    @Test
    void stopLimitSellTriggersThenWaitsForBidAtOrAboveLimit() {
        var order = service.createOrder(userId, request(OrderSide.sell, OrderType.stop_limit, "10", "44", "45"));
        when(pricing.getQuote("AAPL")).thenReturn(quote("43", "43.5", false, Instant.now()));
        execution.executeOrder(order.orderId());
        assertTrue(service.getOrderById(userId, order.orderId()).stopTriggered());
        assertEquals(OrderStatus.accepted, service.getOrderById(userId, order.orderId()).status());
        when(pricing.getQuote("AAPL")).thenReturn(quote("44.25", "44.5", false, Instant.now()));
        execution.executeOrder(order.orderId());
        assertFilled(order.orderId(), "44.25", "442.5");
    }

    @Test
    void stopLimitPricesCanBeEditedThroughApiUntilStopTriggers() throws Exception {
        balance("100");
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.stop_limit, "1", "52", "51"));
        String url = "/api/v1/orders/" + order.orderId();
        mvc.perform(patch(url).contentType(MediaType.APPLICATION_JSON).content("{\"stopPrice\":53,\"limitPrice\":54}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stopPrice").value(53))
                .andExpect(jsonPath("$.limitPrice").value(54))
                .andExpect(jsonPath("$.stopTriggered").value(false));
        assertMoney("54", orders.findById(order.orderId()).orElseThrow().getReservedCash());

        // Ask reaches the stop but stays above the limit: triggered, still waiting.
        when(pricing.getQuote("AAPL")).thenReturn(quote("54.5", "55", false, Instant.now()));
        execution.executeOrder(order.orderId());
        assertTrue(service.getOrderById(userId, order.orderId()).stopTriggered());

        mvc.perform(patch(url).contentType(MediaType.APPLICATION_JSON).content("{\"stopPrice\":52}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch(url).contentType(MediaType.APPLICATION_JSON).content("{\"limitPrice\":55}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limitPrice").value(55))
                .andExpect(jsonPath("$.stopPrice").value(53))
                .andExpect(jsonPath("$.stopTriggered").value(true));
        // The whole order is revalidated, including cash for a higher buy limit.
        mvc.perform(patch(url).contentType(MediaType.APPLICATION_JSON).content("{\"limitPrice\":101}"))
                .andExpect(status().isBadRequest());
        assertMoney("55", orders.findById(order.orderId()).orElseThrow().getLimitPrice());
        execution.executeOrder(order.orderId());
        assertFilled(order.orderId(), "55", "55");
    }

    @Test
    void explicitPriceEditsRejectPricesTheOrderTypeDoesNotUse() throws Exception {
        var limit = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "1", "49", null));
        mvc.perform(patch("/api/v1/orders/" + limit.orderId()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"stopPrice\":48}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/v1/orders/" + limit.orderId()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"price\":48,\"limitPrice\":48}"))
                .andExpect(status().isBadRequest());
        assertMoney("49", orders.findById(limit.orderId()).orElseThrow().getLimitPrice());

        var stop = service.createOrder(userId, request(OrderSide.sell, OrderType.stop, "1", null, "45"));
        mvc.perform(patch("/api/v1/orders/" + stop.orderId()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"stopPrice\":44}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stopPrice").value(44))
                .andExpect(jsonPath("$.limitPrice").doesNotExist());
    }

    @Test
    void unavailableMarketDataLeavesAcceptedOrderForRetry() {
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "30", "50", null));
        when(pricing.getQuote("AAPL")).thenThrow(new PricingApiException("offline"));
        assertThrows(RuntimeException.class, () -> execution.executeOrder(order.orderId()));
        assertEquals(OrderStatus.accepted, service.getOrderById(userId, order.orderId()).status());
        assertBalances("10000", "50");
        doReturn(quote("50", "50", false, Instant.now())).when(pricing).getQuote("AAPL");
        execution.executeOrder(order.orderId());
        assertFilled(order.orderId(), "50", "1500");
    }

    @ParameterizedTest
    @CsvSource({"true,3600", "false,3600"})
    void futureQuoteCannotAcceptMarketBuyOrExecuteLimit(boolean stale, long offset) {
        var limit = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "1", "50", null));
        when(pricing.getQuote("AAPL")).thenReturn(quote("50", "50", stale, Instant.now().plusSeconds(offset)));
        assertThrows(RuntimeException.class, () -> service.createOrder(userId, request(OrderSide.buy, OrderType.market, "1", null, null)));
        assertThrows(RuntimeException.class, () -> execution.executeOrder(limit.orderId()));
        assertEquals(OrderStatus.accepted, service.getOrderById(userId, limit.orderId()).status());
        assertEquals(1, orders.findByAccountId(accountId).size());
        assertBalances("10000", "50");
    }

    @ParameterizedTest
    @CsvSource({"true", "false"})
    void latestClosingQuoteAllowsBuyAndExecutionFetchesAgain(boolean stale) {
        Instant close = Instant.now().minusSeconds(3 * 24 * 3600);
        when(pricing.getQuote("AAPL")).thenReturn(quote("49", "50", stale, close));
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.market, "2", null, null));
        when(pricing.getQuote("AAPL")).thenReturn(quote("50", "51", stale, close));
        execution.executeOrder(order.orderId());
        assertFilled(order.orderId(), "51", "102");
        assertBalances("9898", "52");
        verify(pricing, times(2)).getQuote("AAPL");
        var sell = service.createOrder(userId, request(OrderSide.sell, OrderType.market, "1", null, null));
        when(pricing.getQuote("AAPL")).thenReturn(quote("52", "53", stale, close));
        execution.executeOrder(sell.orderId());
        assertFilled(sell.orderId(), "52", "52");
        assertBalances("9950", "51");
        verify(pricing, times(3)).getQuote("AAPL");
    }

    @Test
    void unavailablePricingReturnsBadGatewayInsteadOfInternalServerError() throws Exception {
        when(pricing.getQuote("AAPL")).thenThrow(new PricingApiException("offline"));
        mvc.perform(post("/api/v1/orders").contentType(MediaType.APPLICATION_JSON)
                .content("{\"accountId\":\"" + accountId + "\",\"symbol\":\"AAPL\","
                        + "\"orderType\":\"market\",\"orderSide\":\"buy\",\"quantity\":1}"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.detail").value("Unable to retrieve pricing for symbol AAPL"));
    }

    @Test
    void fillInsertFailureRollsBackCashHoldingAndStatusThenRetrySucceeds() {
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "30", "50", null));
        jdbc.execute("alter table trade_fills add constraint reject_test_fill check (order_id <> '" + order.orderId() + "')");
        try {
            assertThrows(RuntimeException.class, () -> execution.executeOrder(order.orderId()));
            assertBalances("10000", "50");
            assertEquals(OrderStatus.accepted, service.getOrderById(userId, order.orderId()).status());
            assertTrue(fills.findByOrderId(order.orderId()).isEmpty());
        } finally {
            jdbc.execute("alter table trade_fills drop constraint reject_test_fill");
        }
        execution.executeOrder(order.orderId());
        assertBalances("8500", "80");
        assertFilled(order.orderId(), "50", "1500");
    }

    @Test
    void holdingWriteFailureRollsBackFillCashAndOrderStatus() {
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "30", "50", null));
        jdbc.execute("alter table holdings add constraint reject_test_holding check (account_id <> '" + accountId + "' or quantity <= 50)");
        try {
            assertThrows(RuntimeException.class, () -> execution.executeOrder(order.orderId()));
            assertBalances("10000", "50");
            assertEquals(OrderStatus.accepted, service.getOrderById(userId, order.orderId()).status());
            assertTrue(fills.findByOrderId(order.orderId()).isEmpty());
        } finally {
            jdbc.execute("alter table holdings drop constraint reject_test_holding");
        }
    }

    @Test
    @EnabledIfSystemProperty(named = "order.test.jdbc-driver", matches = "org\\.postgresql\\.Driver")
    void postgresProtectsPermanentFillRecordsFromUpdatesAndDeletes() {
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "30", "50", null));
        execution.executeOrder(order.orderId());

        var updateError = assertThrows(DataAccessException.class,
                () -> jdbc.update("update trade_fills set cash_amount = 1 where order_id = ?", order.orderId()));
        assertTrue(updateError.getMessage().contains("trade fills are append-only"));
        var deleteError = assertThrows(DataAccessException.class,
                () -> jdbc.update("delete from trade_fills where order_id = ?", order.orderId()));
        assertTrue(deleteError.getMessage().contains("trade fills are append-only"));
        assertFilled(order.orderId(), "50", "1500");
        assertBalances("8500", "80");
    }

    @Test
    void buyCreatesFirstHoldingAndPreservesFractionalQuantity() {
        holdings.deleteAll(holdings.findByAccountId(accountId));
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "0.1234", "50", null));
        execution.executeOrder(order.orderId());
        assertBalances("9993.83", "0.1234");
        assertFilled(order.orderId(), "50", "6.17");
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void executionRechecksAccountAndInstrumentEligibility(boolean suspendAccount) {
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "30", "50", null));
        if (suspendAccount) {
            var account = accounts.findById(accountId).orElseThrow();
            account.setSuspended(true);
            accounts.save(account);
        } else {
            var instrument = instruments.findById(instrumentId).orElseThrow();
            instrument.setActive(false);
            instruments.save(instrument);
        }
        execution.executeOrder(order.orderId());
        assertEquals(OrderStatus.rejected, service.getOrderById(userId, order.orderId()).status());
        assertBalances("10000", "50");
        assertTrue(fills.findByOrderId(order.orderId()).isEmpty());
    }

    @Test
    void concurrentSubmissionsCannotCommitSameCashTwice() throws Exception {
        balance("1500");
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        Callable<Boolean> submit = () -> {
            ready.countDown();
            assertTrue(start.await(5, TimeUnit.SECONDS));
            try {
                return service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "30", "50", null)).status() == OrderStatus.accepted;
            } catch (OrderValidationException exception) {
                assertEquals("Insufficient available cash", exception.getMessage());
                return false;
            }
        };
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(submit);
            var second = pool.submit(submit);
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();
            assertNotEquals(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
        }
        assertEquals(2, orders.findByAccountId(accountId).size());
    }

    @Test
    void concurrentExecutionsProduceExactlyOneFill() throws Exception {
        var order = service.createOrder(userId, request(OrderSide.buy, OrderType.limit, "30", "50", null));
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> execution.executeOrder(order.orderId()));
            var second = pool.submit(() -> execution.executeOrder(order.orderId()));
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);
        }
        assertBalances("8500", "80");
        assertFilled(order.orderId(), "50", "1500");
        assertThrows(RuntimeException.class, () -> service.cancelOrder(userId, order.orderId()));
        assertThrows(RuntimeException.class, () -> service.updatePrice(userId, order.orderId(), decimal("51")));
    }

    @Test
    void apiReturnsAcceptedOrderAndReadableValidationErrors() throws Exception {
        String body = """
                {"accountId":"%s","instrumentId":"%s","orderType":"limit",
                 "orderSide":"buy","quantity":30,"limitPrice":50}
                """.formatted(accountId, instrumentId);
        mvc.perform(post("/api/v1/orders").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("accepted"));
        mvc.perform(post("/api/v1/orders").contentType(MediaType.APPLICATION_JSON).content(body.replace("\"quantity\":30", "\"quantity\":0")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.detail").value("Order quantity must be greater than 0"));
        mvc.perform(post("/api/v1/orders").contentType(MediaType.APPLICATION_JSON).content(body.replace("\"buy\"", "\"invalid\"")))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/orders").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/orders").contentType(MediaType.APPLICATION_JSON).content("null"))
                .andExpect(status().isBadRequest());
    }

    private void assertFilled(UUID orderId, String price, String amount) {
        var order = service.getOrderById(userId, orderId);
        var fill = fills.findByOrderId(orderId).orElseThrow();
        assertEquals(OrderStatus.filled, order.status());
        assertNotNull(order.finalizedAt());
        assertMoney(price, order.price());
        assertMoney(price, fill.getPrice());
        assertMoney(amount, fill.getCashAmount());
        assertMoney("0", orders.findById(orderId).orElseThrow().getReservedCash());
    }

    private void assertBalances(String cash, String quantity) {
        assertMoney(cash, accounts.findById(accountId).orElseThrow().getCashBalance());
        assertMoney(quantity, holdings.findByAccountIdAndInstrumentId(accountId, instrumentId).orElseThrow().getQuantity());
    }

    private void balance(String cash) {
        var account = accounts.findById(accountId).orElseThrow();
        account.setCashBalance(decimal(cash));
        accounts.save(account);
    }

    private OrderRequestDto request(OrderSide side, OrderType type, String quantity, String limit, String stop) {
        return new OrderRequestDto(accountId, instrumentId, type, side, decimal(quantity), decimal(limit), decimal(stop));
    }

    private static QuoteResponse quote(String bid, String ask, boolean stale, Instant asOf) {
        return new QuoteResponse("AAPL", decimal("50"), decimal(bid), decimal(ask), null, "USD", null, null, null, asOf, "OPEN", stale, "test");
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, decimal(expected).compareTo(actual), "Expected " + expected + " but got " + actual);
    }

    private static BigDecimal decimal(String value) {
        return value == null ? null : new BigDecimal(value);
    }
}
