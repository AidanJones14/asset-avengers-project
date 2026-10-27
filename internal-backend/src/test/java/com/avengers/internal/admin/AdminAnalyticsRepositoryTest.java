package com.avengers.internal.admin;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

// Runs the admin SQL against a real admin_analytics database (the views use
// Postgres-only features H2 lacks). Load DB/admin_analytics_db.schema.sql into it,
// then run with a user that can write the mirror tables, e.g.
//   mvn -f internal-backend/pom.xml test -Dtest=AdminAnalyticsRepositoryTest
//     -Dadmin.test.jdbc-url=jdbc:postgresql://localhost:5434/admin_analytics
//     -Dadmin.test.jdbc-user=... -Dadmin.test.jdbc-password=...
// Every row uses fresh ids because the fact tables are append-only.
@EnabledIfSystemProperty(named = "admin.test.jdbc-url", matches = "jdbc:postgresql:.*")
class AdminAnalyticsRepositoryTest {

    private static NamedParameterJdbcTemplate namedJdbc;
    private static JdbcTemplate jdbc;

    private AdminLookupRepository lookupRepository;
    private AdminAuditRepository auditRepository;

    private final UUID clientId = UUID.randomUUID();
    private final UUID accountId = UUID.randomUUID();
    private final UUID instrumentId = UUID.randomUUID();
    private final UUID orderId = UUID.randomUUID();
    private final String symbol = "T" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    private final String tag = UUID.randomUUID().toString();
    private final String email = "admin.test+" + tag + "@example.com";
    private final Instant placedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);

    @BeforeAll
    static void connect() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                System.getProperty("admin.test.jdbc-url"),
                System.getProperty("admin.test.jdbc-user", "postgres"),
                System.getProperty("admin.test.jdbc-password", ""));
        namedJdbc = new NamedParameterJdbcTemplate(dataSource);
        jdbc = namedJdbc.getJdbcTemplate();
    }

    @BeforeEach
    void seed() {
        lookupRepository = new AdminLookupRepository(namedJdbc);
        auditRepository = new AdminAuditRepository(namedJdbc);

        Timestamp placed = Timestamp.from(placedAt);
        Timestamp filled = Timestamp.from(placedAt.plusSeconds(5));
        jdbc.update("INSERT INTO instruments (instrument_id, symbol, name, security_type, is_tradable, source_updated_at) "
                + "VALUES (?, ?, 'Test Corp', 'equity', true, now())", instrumentId, symbol);
        jdbc.update("INSERT INTO client_accounts (account_id, client_id, email, cash_balance, is_suspended, source_updated_at,account_name,account_type) "
                + "VALUES (?, ?, ?, 850.00, false, now(),'Retirement','Roth IRA')", accountId, clientId, email);
        jdbc.update("INSERT INTO client_positions (account_id, instrument_id, quantity, source_updated_at) "
                + "VALUES (?, ?, 1, now())", accountId, instrumentId);
        jdbc.update("INSERT INTO trade_records (order_id, client_id, account_id, instrument_id, symbol, order_side, "
                + "order_type, quantity, placed_at) VALUES (?, ?, ?, ?, ?, 'buy', 'market', 1, ?)",
                orderId, clientId, accountId, instrumentId, symbol, placed);
        jdbc.update("INSERT INTO trade_lifecycle_events (order_id, event_type, event_at) VALUES (?, 'accepted', ?)",
                orderId, placed);
        jdbc.update("INSERT INTO trade_lifecycle_events (order_id, event_type, event_at, quantity, price) "
                + "VALUES (?, 'filled', ?, 1, 150)", orderId, filled);
        jdbc.update("INSERT INTO cash_holding_changes (change_id, order_id, client_id, account_id, instrument_id, "
                + "change_type, cash_delta, holding_delta, cash_balance_after, holding_quantity_after, occurred_at) "
                + "VALUES (?, ?, ?, ?, ?, 'trade', -150, 1, 850, 1, ?)",
                UUID.randomUUID(), orderId, clientId, accountId, instrumentId, filled);
    }

    @Test
    void searchClientAccounts_matchesFragmentAndEscapesWildcards() {
        AdminPage<AdminClientAccountDto> page = lookupRepository.searchClientAccounts(
                tag.toUpperCase(), new AdminPageRequest(0, 20));
        assertEquals(1, page.page().totalElements());
        assertEquals(accountId, page.items().getFirst().accountId());

        // Unescaped, "_" and "%" would match the tag's first character.
        for (String wildcard : List.of("_", "%")) {
            assertEquals(0, lookupRepository.searchClientAccounts(wildcard + tag.substring(1),
                    new AdminPageRequest(0, 20)).page().totalElements());
        }
    }

    @Test
    void findClientAccount_includesPositionsAndActivity() {
        AdminClientAccountDto account = lookupRepository.findClientAccount(accountId).orElseThrow();
        assertEquals(clientId, account.clientId());
        assertEquals("Retirement",account.accountName());
        assertEquals("Roth IRA",account.accountType());
        assertEquals(1, account.openPositions());

        List<AdminPositionDto> positions = lookupRepository.findPositions(accountId);
        assertEquals(symbol, positions.getFirst().symbol());

        List<AdminCashChangeDto> activity = lookupRepository.findRecentCashChanges(accountId, 50);
        assertEquals(0, new BigDecimal("-150").compareTo(activity.getFirst().cashDelta()));
        assertEquals(orderId, activity.getFirst().orderId());
    }

    @Test
    void searchOrders_byClientAndBySymbol() {
        AdminPage<AdminOrderDto> byClient = lookupRepository.searchOrders(clientId, null, new AdminPageRequest(0, 20));
        assertEquals(1, byClient.page().totalElements());
        AdminOrderDto order = byClient.items().getFirst();
        assertEquals(OrderStatus.filled, order.status());
        assertEquals(0, new BigDecimal("150").compareTo(order.fillPrice()));

        AdminPage<AdminOrderDto> bySymbol = lookupRepository.searchOrders(null, symbol, new AdminPageRequest(0, 20));
        assertEquals(orderId, bySymbol.items().getFirst().orderId());
    }

    @Test
    void findOrderTimeline_isInLifecycleOrder() {
        List<String> steps = lookupRepository.findOrderTimeline(orderId).stream()
                .map(AdminOrderEventDto::step).toList();

        assertEquals(List.of("accepted", "filled", "cash_and_holding_change"), steps);
    }

    @Test
    void auditRecordsAreSearchable() {
        AdminActor actor = new AdminActor(UUID.randomUUID(), "admin@example.com");
        auditRepository.record(AdminAuditEntry.forAccount(actor, AdminAction.suspend_client, accountId, "test"));
        auditRepository.record(AdminAuditEntry.forOrder(actor, AdminAction.view_trade, orderId, accountId));

        AdminPage<AdminAuditLogEntryDto> all = auditRepository.search(
                new AuditLogFilter(actor.userId(), null, null, null, null), new AdminPageRequest(0, 20));
        assertEquals(2, all.page().totalElements());
        assertEquals(email, all.items().getFirst().targetClientEmail());

        AdminPage<AdminAuditLogEntryDto> suspensions = auditRepository.search(
                new AuditLogFilter(null, accountId, AdminAction.suspend_client, Instant.now().minusSeconds(60), null),
                new AdminPageRequest(0, 20));
        assertEquals(1, suspensions.page().totalElements());
        assertEquals("test", suspensions.items().getFirst().reason());
    }
    @Test
    void orderLookupAndSuspensionSuggestionsCarryTheInvestmentAccount() {
        var order=lookupRepository.findOrder(orderId).orElseThrow();
        assertEquals("Retirement",order.accountName());
        assertEquals("Roth IRA",order.accountType());
        var suggestion=lookupRepository.suggestClientAccounts(tag).getFirst();
        assertEquals(accountId,suggestion.accountId());
        assertEquals("Retirement",suggestion.accountName());
        assertEquals("Roth IRA",suggestion.accountType());
    }

}
