package com.avengers.endgame.tradingcontrol;

import com.avengers.endgame.account.Account;
import com.avengers.endgame.account.AccountMapper;
import com.avengers.endgame.account.AccountRepository;
import com.avengers.endgame.account.AccountResponseDto;
import com.avengers.endgame.instrument.Instrument;
import com.avengers.endgame.instrument.InstrumentMapper;
import com.avengers.endgame.instrument.InstrumentRepository;
import com.avengers.endgame.instrument.InstrumentResponseDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.UUID;

// Authoritative administrative commands run in the trading service. The local
// audit sink and its outbox event commit in the SAME transaction as the flag.
// The internal API forwards the caller's verified JWT to these endpoints.
@Service
public class AdminSuspensionService implements AdminCommands {

    private final AccountRepository accountRepository;
    private final AccountMapper accountMapper;
    private final InstrumentRepository instrumentRepository;
    private final InstrumentMapper instrumentMapper;
    private final AdminAuditSink auditRepository;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;

    public AdminSuspensionService(AccountRepository accountRepository, AccountMapper accountMapper,
                                  InstrumentRepository instrumentRepository, InstrumentMapper instrumentMapper,
                                  AdminAuditSink auditRepository, org.springframework.jdbc.core.JdbcTemplate jdbc) {
        this.accountRepository = accountRepository;
        this.accountMapper = accountMapper;
        this.instrumentRepository = instrumentRepository;
        this.instrumentMapper = instrumentMapper;
        this.auditRepository = auditRepository;
        this.jdbc = jdbc;
    }

    @Transactional
    public AccountResponseDto setAccountSuspended(UUID accountId, boolean suspended, String reason, AdminActor actor) {
        // Same lock order placement and execution use, so this waits for an in-flight order.
        Account account = accountRepository.findByIdForUpdate(accountId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found"));
        if (account.isSuspended() == suspended) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    suspended ? "Account is already suspended" : "Account is not suspended");
        }
        jdbc.update("DELETE FROM account_suspension_schedules WHERE account_id = ?", accountId);
        account.setSuspended(suspended);
        account.setSuspensionReason(suspended ? reason.trim() : null);
        account.setScheduledSuspensionAt(null);
        account.setUpdatedAt(Instant.now());
        Account saved = accountRepository.saveAndFlush(account);

        AdminAction action = suspended ? AdminAction.suspend_client : AdminAction.unsuspend_client;
        auditRepository.record(AdminAuditEntry.forAccount(actor, action, accountId, reason.trim()));
        return accountMapper.toResponse(saved);
    }

    @Transactional
    public InstrumentResponseDto setInstrumentSuspended(UUID instrumentId, boolean suspended, String reason,
                                                        AdminActor actor) {
        Instrument instrument = instrumentRepository.findByIdForUpdate(instrumentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Instrument not found"));
        if (instrument.isActive() != suspended) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    suspended ? "Instrument is already suspended" : "Instrument is not suspended");
        }
        instrument.setActive(!suspended);
        Instrument saved = instrumentRepository.saveAndFlush(instrument);

        AdminAction action = suspended ? AdminAction.suspend_instrument : AdminAction.unsuspend_instrument;
        auditRepository.record(AdminAuditEntry.forInstrument(actor, action, instrumentId, reason.trim()));
        return instrumentMapper.toResponse(saved);
    }
}
