package com.avengers.endgame.tradingcontrol;

import com.avengers.endgame.account.Account;
import com.avengers.endgame.account.AccountRepository;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.Map;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class AccountSuspensionSchedulesTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final AccountRepository accounts = mock(AccountRepository.class);
    private final AdminSuspensionService commands = mock(AdminSuspensionService.class);
    private final AccountSuspensionSchedules service = new AccountSuspensionSchedules(jdbc, accounts, commands);
    private final UUID id = UUID.randomUUID();
    private final AdminActor actor = new AdminActor(UUID.randomUUID(), "admin@example.com");

    @Test void rejectsPastDatesWithoutWriting() {
        assertThrows(ResponseStatusException.class, () -> service.schedule(id,
                new ScheduledSuspensionRequest("Review", Instant.now().minusSeconds(1)), actor));
        verifyNoInteractions(jdbc, accounts, commands);
    }
    @Test void scheduleDoesNotImmediatelySuspendAccount() {
        when(accounts.findByIdForUpdate(id)).thenReturn(Optional.of(mock(Account.class)));
        Instant future = Instant.now().plusSeconds(600);
        assertEquals(future, service.schedule(id, new ScheduledSuspensionRequest("Review", future), actor).get("suspendAt"));
        verifyNoInteractions(commands);
    }
    @Test void dueScheduleUsesOriginalActorAndReason() {
        when(accounts.findByIdForUpdate(id)).thenReturn(Optional.of(mock(Account.class)));
        when(jdbc.queryForList(anyString(), eq(id))).thenReturn(List.of(Map.of(
                "reason", "Review", "actor_id", actor.userId(), "actor_email", actor.email(), "schedule_id", UUID.randomUUID())));
        service.execute(id);
        verify(commands).setAccountSuspended(id, true, "Review", actor);
    }
    @Test void futureOrReplacedScheduleDoesNotExecute() {
        when(accounts.findByIdForUpdate(id)).thenReturn(Optional.of(mock(Account.class)));
        when(jdbc.queryForList(anyString(), eq(id))).thenReturn(List.of());
        service.execute(id);
        verifyNoInteractions(commands);
    }
}
