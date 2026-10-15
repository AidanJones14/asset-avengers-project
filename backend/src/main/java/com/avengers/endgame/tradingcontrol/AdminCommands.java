package com.avengers.endgame.tradingcontrol;

import com.avengers.endgame.account.AccountResponseDto;
import com.avengers.endgame.instrument.InstrumentResponseDto;
import java.util.UUID;

public interface AdminCommands {
    AccountResponseDto setAccountSuspended(UUID accountId, boolean suspended, String reason, AdminActor actor);
    InstrumentResponseDto setInstrumentSuspended(UUID instrumentId, boolean suspended, String reason, AdminActor actor);
}
