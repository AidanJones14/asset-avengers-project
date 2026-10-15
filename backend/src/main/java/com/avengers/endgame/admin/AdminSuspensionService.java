package com.avengers.endgame.admin;

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

// Suspends and reinstates client accounts and instruments. The flag lives in the
// trading database, where OrderValidator and OrderExecutionService enforce it; the
// change is recorded in admin_analytics.admin_audit_log.
//
// The two databases cannot share a transaction. The audit row is written after the
// trading change is flushed but before it commits, so a failed audit insert rolls the
// change back. The opposite gap (audit row kept, trading commit fails) is possible
// but rare, and the audit log is append-only, so it cannot be undone.
@Service
public class AdminSuspensionService {

    private final AccountRepository accountRepository;
    private final AccountMapper accountMapper;
    private final InstrumentRepository instrumentRepository;
    private final InstrumentMapper instrumentMapper;
    private final AdminAuditRepository auditRepository;

    public AdminSuspensionService(AccountRepository accountRepository, AccountMapper accountMapper,
                                  InstrumentRepository instrumentRepository, InstrumentMapper instrumentMapper,
                                  AdminAuditRepository auditRepository) {
        this.accountRepository = accountRepository;
        this.accountMapper = accountMapper;
        this.instrumentRepository = instrumentRepository;
        this.instrumentMapper = instrumentMapper;
        this.auditRepository = auditRepository;
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
        account.setSuspended(suspended);
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
