package com.avengers.endgame.admin;

import com.avengers.endgame.account.Account;
import com.avengers.endgame.account.AccountMapper;
import com.avengers.endgame.account.AccountRepository;
import com.avengers.endgame.account.AccountResponseDto;
import com.avengers.endgame.instrument.Instrument;
import com.avengers.endgame.instrument.InstrumentMapper;
import com.avengers.endgame.instrument.InstrumentRepository;
import com.avengers.endgame.instrument.InstrumentResponseDto;
import com.avengers.endgame.user.User;
import com.avengers.endgame.user.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminSuspensionServiceTest {

    private static final AdminActor ADMIN = new AdminActor(UUID.randomUUID(), "admin@example.com");

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private InstrumentRepository instrumentRepository;

    @Mock
    private AdminAuditRepository auditRepository;

    private AdminSuspensionService service;

    @BeforeEach
    void setUp() {
        service = new AdminSuspensionService(accountRepository, new AccountMapper(),
                instrumentRepository, new InstrumentMapper(), auditRepository);
    }

    @Test
    void suspendAccount_flipsFlagThenRecordsAudit() {
        Account account = account(false);
        when(accountRepository.findByIdForUpdate(account.getAccountId())).thenReturn(Optional.of(account));
        when(accountRepository.saveAndFlush(account)).thenReturn(account);

        AccountResponseDto response = service.setAccountSuspended(account.getAccountId(), true, "  fraud review  ", ADMIN);

        assertTrue(response.suspended());
        InOrder order = inOrder(accountRepository, auditRepository);
        order.verify(accountRepository).saveAndFlush(account);
        order.verify(auditRepository).record(AdminAuditEntry.forAccount(
                ADMIN, AdminAction.suspend_client, account.getAccountId(), "fraud review"));
    }

    @Test
    void unsuspendAccount_recordsUnsuspendAction() {
        Account account = account(true);
        when(accountRepository.findByIdForUpdate(account.getAccountId())).thenReturn(Optional.of(account));
        when(accountRepository.saveAndFlush(account)).thenReturn(account);

        AccountResponseDto response = service.setAccountSuspended(account.getAccountId(), false, "cleared", ADMIN);

        assertFalse(response.suspended());
        verify(auditRepository).record(AdminAuditEntry.forAccount(
                ADMIN, AdminAction.unsuspend_client, account.getAccountId(), "cleared"));
    }

    @Test
    void suspendAccount_alreadySuspended_conflictsWithoutWriting() {
        Account account = account(true);
        when(accountRepository.findByIdForUpdate(account.getAccountId())).thenReturn(Optional.of(account));

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> service.setAccountSuspended(account.getAccountId(), true, "again", ADMIN));

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
        verify(accountRepository, never()).saveAndFlush(any());
        verify(auditRepository, never()).record(any());
    }

    @Test
    void suspendAccount_unknownAccount_notFound() {
        UUID accountId = UUID.randomUUID();
        when(accountRepository.findByIdForUpdate(accountId)).thenReturn(Optional.empty());

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> service.setAccountSuspended(accountId, true, "reason", ADMIN));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
        verify(auditRepository, never()).record(any());
    }

    @Test
    void suspendAccount_auditFailurePropagatesSoTheTransactionRollsBack() {
        Account account = account(false);
        when(accountRepository.findByIdForUpdate(account.getAccountId())).thenReturn(Optional.of(account));
        when(accountRepository.saveAndFlush(account)).thenReturn(account);
        RuntimeException auditDown = new RuntimeException("admin_analytics unavailable");
        doThrow(auditDown).when(auditRepository).record(any());

        RuntimeException thrown = assertThrows(RuntimeException.class,
                () -> service.setAccountSuspended(account.getAccountId(), true, "reason", ADMIN));

        assertSame(auditDown, thrown);
    }

    @Test
    void suspendInstrument_marksInactiveAndRecordsAudit() {
        Instrument instrument = instrument(true);
        when(instrumentRepository.findByIdForUpdate(instrument.getInstrumentId())).thenReturn(Optional.of(instrument));
        when(instrumentRepository.saveAndFlush(instrument)).thenReturn(instrument);

        InstrumentResponseDto response = service.setInstrumentSuspended(instrument.getInstrumentId(), true, "halted", ADMIN);

        assertFalse(response.isActive());
        verify(auditRepository).record(AdminAuditEntry.forInstrument(
                ADMIN, AdminAction.suspend_instrument, instrument.getInstrumentId(), "halted"));
    }

    @Test
    void unsuspendInstrument_alreadyActive_conflicts() {
        Instrument instrument = instrument(true);
        when(instrumentRepository.findByIdForUpdate(instrument.getInstrumentId())).thenReturn(Optional.of(instrument));

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> service.setInstrumentSuspended(instrument.getInstrumentId(), false, "reason", ADMIN));

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
        verify(instrumentRepository, never()).saveAndFlush(any());
        verify(auditRepository, never()).record(any());
    }

    private static Account account(boolean suspended) {
        Account account = new Account(new User(UUID.randomUUID(), "Client", UserRole.client), new BigDecimal("100.00"));
        account.setAccountId(UUID.randomUUID());
        account.setSuspended(suspended);
        return account;
    }

    private static Instrument instrument(boolean active) {
        Instrument instrument = new Instrument();
        instrument.setInstrumentId(UUID.randomUUID());
        instrument.setSymbol("AAPL");
        instrument.setActive(active);
        return instrument;
    }
}
