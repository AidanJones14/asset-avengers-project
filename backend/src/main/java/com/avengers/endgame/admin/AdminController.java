package com.avengers.endgame.admin;

import com.avengers.endgame.account.AccountResponseDto;
import com.avengers.endgame.instrument.InstrumentResponseDto;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.UUID;

import static com.avengers.endgame.admin.AdminActorResolver.ADMIN_ID_HEADER;

// Admin endpoints. Every request names the acting admin in the X-Admin-Id header
// until auth is wired in (see AdminActorResolver).
@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    private final AdminActorResolver actorResolver;
    private final AdminLookupService lookupService;
    private final AdminSuspensionService suspensionService;

    public AdminController(AdminActorResolver actorResolver, AdminLookupService lookupService,
                           AdminSuspensionService suspensionService) {
        this.actorResolver = actorResolver;
        this.lookupService = lookupService;
        this.suspensionService = suspensionService;
    }

    @GetMapping("/clients")
    public AdminPage<AdminClientAccountDto> searchClients(
            @RequestHeader(value = ADMIN_ID_HEADER, required = false) UUID adminId,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        actorResolver.resolve(adminId);
        return lookupService.searchClients(q, new AdminPageRequest(page, size));
    }

    @GetMapping("/accounts/{accountId}")
    public AdminAccountDetailDto getAccount(
            @RequestHeader(value = ADMIN_ID_HEADER, required = false) UUID adminId,
            @PathVariable UUID accountId) {
        return lookupService.getAccount(accountId, actorResolver.resolve(adminId));
    }

    @PostMapping("/accounts/{accountId}/suspend")
    public AccountResponseDto suspendAccount(
            @RequestHeader(value = ADMIN_ID_HEADER, required = false) UUID adminId,
            @PathVariable UUID accountId,
            @Valid @RequestBody SuspensionRequestDto request) {
        return suspensionService.setAccountSuspended(accountId, true, request.reason(), actorResolver.resolve(adminId));
    }

    @PostMapping("/accounts/{accountId}/unsuspend")
    public AccountResponseDto unsuspendAccount(
            @RequestHeader(value = ADMIN_ID_HEADER, required = false) UUID adminId,
            @PathVariable UUID accountId,
            @Valid @RequestBody SuspensionRequestDto request) {
        return suspensionService.setAccountSuspended(accountId, false, request.reason(), actorResolver.resolve(adminId));
    }

    @GetMapping("/orders")
    public AdminPage<AdminOrderDto> searchOrders(
            @RequestHeader(value = ADMIN_ID_HEADER, required = false) UUID adminId,
            @RequestParam(required = false) UUID clientId,
            @RequestParam(required = false) String symbol,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        actorResolver.resolve(adminId);
        return lookupService.searchOrders(clientId, symbol, new AdminPageRequest(page, size));
    }

    @GetMapping("/orders/{orderId}/lifecycle")
    public AdminOrderLifecycleDto getOrderLifecycle(
            @RequestHeader(value = ADMIN_ID_HEADER, required = false) UUID adminId,
            @PathVariable UUID orderId) {
        return lookupService.getOrderLifecycle(orderId, actorResolver.resolve(adminId));
    }

    @PostMapping("/instruments/{instrumentId}/suspend")
    public InstrumentResponseDto suspendInstrument(
            @RequestHeader(value = ADMIN_ID_HEADER, required = false) UUID adminId,
            @PathVariable UUID instrumentId,
            @Valid @RequestBody SuspensionRequestDto request) {
        return suspensionService.setInstrumentSuspended(instrumentId, true, request.reason(),
                actorResolver.resolve(adminId));
    }

    @PostMapping("/instruments/{instrumentId}/unsuspend")
    public InstrumentResponseDto unsuspendInstrument(
            @RequestHeader(value = ADMIN_ID_HEADER, required = false) UUID adminId,
            @PathVariable UUID instrumentId,
            @Valid @RequestBody SuspensionRequestDto request) {
        return suspensionService.setInstrumentSuspended(instrumentId, false, request.reason(),
                actorResolver.resolve(adminId));
    }

    @GetMapping("/audit-log")
    public AdminPage<AdminAuditLogEntryDto> searchAuditLog(
            @RequestHeader(value = ADMIN_ID_HEADER, required = false) UUID adminId,
            @RequestParam(required = false) UUID actorId,
            @RequestParam(required = false) UUID accountId,
            @RequestParam(required = false) AdminAction action,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        actorResolver.resolve(adminId);
        return lookupService.searchAuditLog(new AuditLogFilter(actorId, accountId, action, from, to),
                new AdminPageRequest(page, size));
    }
}
