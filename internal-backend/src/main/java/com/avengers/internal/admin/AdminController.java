package com.avengers.internal.admin;

import com.avengers.internal.security.CurrentActor;
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


// Staff identity comes exclusively from the verified JWT. StaffSecurityConfig's URL rule already
// limited /api/v1/admin/** to ADMIN and SUPER_ADMIN; @CurrentActor only reads who is calling.
@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    private final AdminLookupService lookupService;
    private final AdminCommands suspensionService;

    public AdminController(AdminLookupService lookupService, AdminCommands suspensionService) {
        this.lookupService = lookupService;
        this.suspensionService = suspensionService;
    }

    @GetMapping("/clients/suggestions")
    public java.util.List<AdminClientSuggestionDto> suggestClients(@RequestParam(defaultValue="") String q) {
        return lookupService.suggestClients(q);
    }

    @GetMapping("/clients")
    public AdminPage<AdminClientAccountDto> searchClients(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return lookupService.searchClients(q, new AdminPageRequest(page, size));
    }

    @GetMapping("/accounts/{accountId}")
    public AdminAccountDetailDto getAccount(
            @PathVariable UUID accountId, @CurrentActor AdminActor actor) {
        return lookupService.getAccount(accountId, actor);
    }

    @PostMapping("/accounts/{accountId}/suspend")
    public AccountResponseDto suspendAccount(
            @PathVariable UUID accountId,
            @Valid @RequestBody SuspensionRequestDto request, @CurrentActor AdminActor actor) {
        return suspensionService.setAccountSuspended(accountId, true, request.reason(), actor);
    }

    @PostMapping("/accounts/{accountId}/unsuspend")
    public AccountResponseDto unsuspendAccount(
            @PathVariable UUID accountId,
            @Valid @RequestBody SuspensionRequestDto request, @CurrentActor AdminActor actor) {
        return suspensionService.setAccountSuspended(accountId, false, request.reason(), actor);
    }

    @GetMapping("/orders")
    public AdminPage<AdminOrderDto> searchOrders(
            @RequestParam(required = false) UUID clientId,
            @RequestParam(required = false) String symbol,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return lookupService.searchOrders(clientId, symbol, new AdminPageRequest(page, size));
    }

    @GetMapping("/orders/{orderId}/lifecycle")
    public AdminOrderLifecycleDto getOrderLifecycle(
            @PathVariable UUID orderId, @CurrentActor AdminActor actor) {
        return lookupService.getOrderLifecycle(orderId, actor);
    }

    @PostMapping("/instruments/{instrumentId}/suspend")
    public InstrumentResponseDto suspendInstrument(
            @PathVariable UUID instrumentId,
            @Valid @RequestBody SuspensionRequestDto request, @CurrentActor AdminActor actor) {
        return suspensionService.setInstrumentSuspended(instrumentId, true, request.reason(), actor);
    }

    @PostMapping("/instruments/{instrumentId}/unsuspend")
    public InstrumentResponseDto unsuspendInstrument(
            @PathVariable UUID instrumentId,
            @Valid @RequestBody SuspensionRequestDto request, @CurrentActor AdminActor actor) {
        return suspensionService.setInstrumentSuspended(instrumentId, false, request.reason(), actor);
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
        return lookupService.searchAuditLog(new AuditLogFilter(actorId, accountId, action, from, to),
                new AdminPageRequest(page, size));
    }
}
