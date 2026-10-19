package com.avengers.endgame.tradingcontrol;

import com.avengers.endgame.account.AccountResponseDto;
import com.avengers.endgame.instrument.InstrumentResponseDto;
import com.avengers.endgame.security.CurrentUserId;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;
import java.util.UUID;

// Owner: trading control (web layer). Suspends or unsuspends a client's trading account or an instrument.
// Called by internal-backend, which forwards the admin's own JWT (TradingAdminClient), so this API checks
//   that token itself, like any other request.
// Before any method here runs:
//   - SecurityConfig allows only ADMIN and SUPER_ADMIN tokens on /api/v1/admin/** (anyone else gets 403)
//   - UserProvisioningInterceptor has upserted the admin's users row
// So this controller holds no security logic: it takes the admin's id and asks the service.
// Errors go through OrderExceptionHandler like every controller: a malformed id or body is 400, an unknown
//   account or instrument 404, one already in that state 409. internal-backend shows the detail to the admin.
@RestController
@RequestMapping("/api/v1/admin")
public class TradingAdminCommandController {
    private final AdminSuspensionService commands;
    private final AdminActorResolver actors;

    // Constructor injection: Spring passes in these beans.
    public TradingAdminCommandController(AdminSuspensionService commands, AdminActorResolver actors) {
        this.commands = commands;
        this.actors = actors;
    }

    @PostMapping("/accounts/{id}/suspend")
    public AccountResponseDto suspendAccount(@PathVariable UUID id, @Valid @RequestBody SuspensionRequestDto request,
                                             @CurrentUserId UUID adminId) {
        return commands.setAccountSuspended(id, true, request.reason(), actors.resolve(adminId));
    }

    @PostMapping("/accounts/{id}/unsuspend")
    public AccountResponseDto unsuspendAccount(@PathVariable UUID id, @Valid @RequestBody SuspensionRequestDto request,
                                               @CurrentUserId UUID adminId) {
        return commands.setAccountSuspended(id, false, request.reason(), actors.resolve(adminId));
    }

    @PostMapping("/instruments/{id}/suspend")
    public InstrumentResponseDto suspendInstrument(@PathVariable UUID id, @Valid @RequestBody SuspensionRequestDto request,
                                                   @CurrentUserId UUID adminId) {
        return commands.setInstrumentSuspended(id, true, request.reason(), actors.resolve(adminId));
    }

    @PostMapping("/instruments/{id}/unsuspend")
    public InstrumentResponseDto unsuspendInstrument(@PathVariable UUID id, @Valid @RequestBody SuspensionRequestDto request,
                                                     @CurrentUserId UUID adminId) {
        return commands.setInstrumentSuspended(id, false, request.reason(), actors.resolve(adminId));
    }
}
