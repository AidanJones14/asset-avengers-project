package com.avengers.endgame.tradingcontrol;

import com.avengers.endgame.account.AccountResponseDto;
import com.avengers.endgame.instrument.InstrumentResponseDto;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin")
public class TradingAdminCommandController {
    private final AdminSuspensionService commands;
    private final AdminActorResolver actors;
    public TradingAdminCommandController(AdminSuspensionService commands,AdminActorResolver actors) {
        this.commands=commands; this.actors=actors;
    }
    @PostMapping("/accounts/{id}/suspend")
    public AccountResponseDto suspendAccount(@PathVariable UUID id,@Valid @RequestBody SuspensionRequestDto request) {
        return commands.setAccountSuspended(id,true,request.reason(),actors.resolve());
    }
    @PostMapping("/accounts/{id}/unsuspend")
    public AccountResponseDto unsuspendAccount(@PathVariable UUID id,@Valid @RequestBody SuspensionRequestDto request) {
        return commands.setAccountSuspended(id,false,request.reason(),actors.resolve());
    }
    @PostMapping("/instruments/{id}/suspend")
    public InstrumentResponseDto suspendInstrument(@PathVariable UUID id,@Valid @RequestBody SuspensionRequestDto request) {
        return commands.setInstrumentSuspended(id,true,request.reason(),actors.resolve());
    }
    @PostMapping("/instruments/{id}/unsuspend")
    public InstrumentResponseDto unsuspendInstrument(@PathVariable UUID id,@Valid @RequestBody SuspensionRequestDto request) {
        return commands.setInstrumentSuspended(id,false,request.reason(),actors.resolve());
    }
}
