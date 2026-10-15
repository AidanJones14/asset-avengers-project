package com.avengers.endgame.admin;

import com.avengers.endgame.account.Account;
import com.avengers.endgame.account.AccountMapper;
import com.avengers.endgame.account.AccountRepository;
import com.avengers.endgame.exception.OrderExceptionHandler;
import com.avengers.endgame.instrument.InstrumentMapper;
import com.avengers.endgame.instrument.InstrumentRepository;
import com.avengers.endgame.order.domain.OrderSide;
import com.avengers.endgame.order.domain.OrderStatus;
import com.avengers.endgame.order.domain.OrderType;
import com.avengers.endgame.user.User;
import com.avengers.endgame.user.UserRepository;
import com.avengers.endgame.user.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.avengers.endgame.admin.AdminActorResolver.ADMIN_ID_HEADER;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Real controller, actor resolver and services over mocked repositories.
@ExtendWith(MockitoExtension.class)
class AdminControllerTest {

    private static final UUID ADMIN_ID = UUID.randomUUID();
    private static final UUID CLIENT_ID = UUID.randomUUID();

    @Mock
    private UserRepository userRepository;

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private InstrumentRepository instrumentRepository;

    @Mock
    private AdminLookupRepository lookupRepository;

    @Mock
    private AdminAuditRepository auditRepository;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        AdminController controller = new AdminController(
                new AdminActorResolver(userRepository),
                new AdminLookupService(lookupRepository, auditRepository),
                new AdminSuspensionService(accountRepository, new AccountMapper(), instrumentRepository,
                        new InstrumentMapper(), auditRepository));
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new AdminExceptionHandler(), new OrderExceptionHandler())
                .build();
    }

    @Test
    void missingAdminHeader_returns400() throws Exception {
        mockMvc.perform(get("/api/v1/admin/clients").param("q", "frank"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void malformedAdminHeader_returns400() throws Exception {
        mockMvc.perform(get("/api/v1/admin/clients").param("q", "frank").header(ADMIN_ID_HEADER, "not-a-uuid"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void nonAdminCaller_returns403() throws Exception {
        UUID clientId = UUID.randomUUID();
        when(userRepository.findById(clientId)).thenReturn(Optional.of(new User(clientId, "Client", UserRole.client)));

        mockMvc.perform(get("/api/v1/admin/clients").param("q", "frank").header(ADMIN_ID_HEADER, clientId))
                .andExpect(status().isForbidden());
    }

    @Test
    void searchClients_shortQuery_returns400() throws Exception {
        givenAdmin();

        mockMvc.perform(get("/api/v1/admin/clients").param("q", "fr").header(ADMIN_ID_HEADER, ADMIN_ID))
                .andExpect(status().isBadRequest());
    }

    @Test
    void searchClients_returnsPage() throws Exception {
        givenAdmin();
        AdminClientAccountDto account = new AdminClientAccountDto(CLIENT_ID, UUID.randomUUID(), "frank@example.com",
                new BigDecimal("10.00"), false, 2, Instant.parse("2026-10-01T00:00:00Z"));
        AdminPageRequest page = new AdminPageRequest(0, 20);
        when(lookupRepository.searchClientAccounts("frank", page)).thenReturn(AdminPage.of(List.of(account), page, 1));

        mockMvc.perform(get("/api/v1/admin/clients").param("q", " frank ").header(ADMIN_ID_HEADER, ADMIN_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].email").value("frank@example.com"))
                .andExpect(jsonPath("$.page.totalElements").value(1))
                .andExpect(jsonPath("$.page.totalPages").value(1));
    }

    @Test
    void oversizedPage_returns400() throws Exception {
        givenAdmin();

        mockMvc.perform(get("/api/v1/admin/clients").param("q", "frank").param("size", "101")
                        .header(ADMIN_ID_HEADER, ADMIN_ID))
                .andExpect(status().isBadRequest());
    }

    @Test
    void searchOrders_withoutFilters_returns400() throws Exception {
        givenAdmin();

        mockMvc.perform(get("/api/v1/admin/orders").header(ADMIN_ID_HEADER, ADMIN_ID))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getAccount_recordsView() throws Exception {
        givenAdmin();
        UUID accountId = UUID.randomUUID();
        when(lookupRepository.findClientAccount(accountId)).thenReturn(Optional.of(new AdminClientAccountDto(
                CLIENT_ID, accountId, "frank@example.com", BigDecimal.TEN, false, 0, Instant.now())));

        mockMvc.perform(get("/api/v1/admin/accounts/{id}", accountId).header(ADMIN_ID_HEADER, ADMIN_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.account.accountId").value(accountId.toString()));

        verify(auditRepository).record(AdminAuditEntry.forAccount(
                new AdminActor(ADMIN_ID, "admin@example.com"), AdminAction.view_client_account, accountId, null));
    }

    @Test
    void getOrderLifecycle_unknownOrder_returns404WithoutAudit() throws Exception {
        givenAdmin();
        UUID orderId = UUID.randomUUID();
        when(lookupRepository.findOrder(orderId)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/admin/orders/{id}/lifecycle", orderId).header(ADMIN_ID_HEADER, ADMIN_ID))
                .andExpect(status().isNotFound());

        verify(auditRepository, never()).record(any());
    }

    @Test
    void getOrderLifecycle_returnsEventsAndRecordsView() throws Exception {
        givenAdmin();
        UUID orderId = UUID.randomUUID();
        UUID accountId = UUID.randomUUID();
        Instant placed = Instant.parse("2026-10-01T14:00:00Z");
        AdminOrderDto order = new AdminOrderDto(orderId, CLIENT_ID, accountId, "AAPL", OrderSide.buy,
                OrderType.market, BigDecimal.ONE, null, null, OrderStatus.filled, placed, placed, null,
                placed.plusSeconds(5), new BigDecimal("150.0000"), null, null, null,
                new BigDecimal("-150.00"), BigDecimal.ONE);
        when(lookupRepository.findOrder(orderId)).thenReturn(Optional.of(order));
        when(lookupRepository.findOrderTimeline(orderId)).thenReturn(List.of(
                new AdminOrderEventDto("accepted", placed, null, null, null, null, null, null, null),
                new AdminOrderEventDto("filled", placed.plusSeconds(5), BigDecimal.ONE, new BigDecimal("150.0000"),
                        null, null, null, null, null)));

        mockMvc.perform(get("/api/v1/admin/orders/{id}/lifecycle", orderId).header(ADMIN_ID_HEADER, ADMIN_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.order.status").value("filled"))
                .andExpect(jsonPath("$.events[1].step").value("filled"));

        verify(auditRepository).record(AdminAuditEntry.forOrder(
                new AdminActor(ADMIN_ID, "admin@example.com"), AdminAction.view_trade, orderId, accountId));
    }

    @Test
    void suspendAccount_returnsNewState() throws Exception {
        givenAdmin();
        Account account = new Account(new User(CLIENT_ID, "Client", UserRole.client), BigDecimal.TEN);
        account.setAccountId(UUID.randomUUID());
        when(accountRepository.findByIdForUpdate(account.getAccountId())).thenReturn(Optional.of(account));
        when(accountRepository.saveAndFlush(account)).thenReturn(account);

        mockMvc.perform(post("/api/v1/admin/accounts/{id}/suspend", account.getAccountId())
                        .header(ADMIN_ID_HEADER, ADMIN_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"fraud review\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suspended").value(true));
    }

    @Test
    void suspendAccount_alreadySuspended_returns409() throws Exception {
        givenAdmin();
        Account account = new Account(new User(CLIENT_ID, "Client", UserRole.client), BigDecimal.TEN);
        account.setAccountId(UUID.randomUUID());
        account.setSuspended(true);
        when(accountRepository.findByIdForUpdate(account.getAccountId())).thenReturn(Optional.of(account));

        mockMvc.perform(post("/api/v1/admin/accounts/{id}/suspend", account.getAccountId())
                        .header(ADMIN_ID_HEADER, ADMIN_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"again\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void suspendAccount_blankReason_returns400() throws Exception {
        mockMvc.perform(post("/api/v1/admin/accounts/{id}/suspend", UUID.randomUUID())
                        .header(ADMIN_ID_HEADER, ADMIN_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\" \"}"))
                .andExpect(status().isBadRequest());

        verify(auditRepository, never()).record(any());
    }

    @Test
    void suspendInstrument_missingBody_returns400() throws Exception {
        mockMvc.perform(post("/api/v1/admin/instruments/{id}/suspend", UUID.randomUUID())
                        .header(ADMIN_ID_HEADER, ADMIN_ID)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest());
    }

    @Test
    void auditLog_unknownAction_returns400() throws Exception {
        mockMvc.perform(get("/api/v1/admin/audit-log").param("action", "delete_everything")
                        .header(ADMIN_ID_HEADER, ADMIN_ID))
                .andExpect(status().isBadRequest());
    }

    @Test
    void auditLog_fromAfterTo_returns400() throws Exception {
        givenAdmin();

        mockMvc.perform(get("/api/v1/admin/audit-log")
                        .param("from", "2026-10-02T00:00:00Z").param("to", "2026-10-01T00:00:00Z")
                        .header(ADMIN_ID_HEADER, ADMIN_ID))
                .andExpect(status().isBadRequest());
    }

    private void givenAdmin() {
        User admin = new User(ADMIN_ID, "Admin", UserRole.admin);
        admin.setEmail("admin@example.com");
        when(userRepository.findById(ADMIN_ID)).thenReturn(Optional.of(admin));
    }
}
