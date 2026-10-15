package com.avengers.internal.admin;

import com.avengers.internal.security.AdminActorResolver;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.UUID;


// Staff identity comes exclusively from the verified JWT.
@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    private final AdminActorResolver actorResolver;
    private final AdminLookupService lookupService;
    private final AdminCommands suspensionService;

    public AdminController(AdminActorResolver actorResolver, AdminLookupService lookupService,
                           AdminCommands suspensionService) {
        this.actorResolver = actorResolver;
        this.lookupService = lookupService;
        this.suspensionService = suspensionService;
    }

    @GetMapping("/clients")
    public AdminPage<AdminClientAccountDto> searchClients(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        actorResolver.resolve();
        return lookupService.searchClients(q, new AdminPageRequest(page, size));
    }

    @GetMapping("/accounts/{accountId}")
    public AdminAccountDetailDto getAccount(
            @PathVariable UUID accountId) {
        return lookupService.getAccount(accountId, actorResolver.resolve());
    }

    @PostMapping("/accounts/{accountId}/suspend")
    public AccountResponseDto suspendAccount(
            @PathVariable UUID accountId,
            @Valid @RequestBody SuspensionRequestDto request) {
        return suspensionService.setAccountSuspended(accountId, true, request.reason(), actorResolver.resolve());
    }

    @PostMapping("/accounts/{accountId}/unsuspend")
    public AccountResponseDto unsuspendAccount(
            @PathVariable UUID accountId,
            @Valid @RequestBody SuspensionRequestDto request) {
        return suspensionService.setAccountSuspended(accountId, false, request.reason(), actorResolver.resolve());
    }

    @GetMapping("/orders")
    public AdminPage<AdminOrderDto> searchOrders(
            @RequestParam(required = false) UUID clientId,
            @RequestParam(required = false) String symbol,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        actorResolver.resolve();
        return lookupService.searchOrders(clientId, symbol, new AdminPageRequest(page, size));
    }

    @GetMapping("/orders/{orderId}/lifecycle")
    public AdminOrderLifecycleDto getOrderLifecycle(
            @PathVariable UUID orderId) {
        return lookupService.getOrderLifecycle(orderId, actorResolver.resolve());
    }

    @PostMapping("/instruments/{instrumentId}/suspend")
    public InstrumentResponseDto suspendInstrument(
            @PathVariable UUID instrumentId,
            @Valid @RequestBody SuspensionRequestDto request) {
        return suspensionService.setInstrumentSuspended(instrumentId, true, request.reason(),
                actorResolver.resolve());
    }

    @PostMapping("/instruments/{instrumentId}/unsuspend")
    public InstrumentResponseDto unsuspendInstrument(
            @PathVariable UUID instrumentId,
            @Valid @RequestBody SuspensionRequestDto request) {
        return suspensionService.setInstrumentSuspended(instrumentId, false, request.reason(),
                actorResolver.resolve());
    }

    @GetMapping("/audit-log")
    public AdminPage<AdminAuditLogEntryDto> searchAuditLog(
            @RequestParam(required = false) UUID actorId,
            @RequestParam(required = false) UUID accountId,
            @RequestParam(required = false) AdminAction action,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        actorResolver.resolve();
        return lookupService.searchAuditLog(new AuditLogFilter(actorId, accountId, action, from, to),
                new AdminPageRequest(page, size));
    }
}
