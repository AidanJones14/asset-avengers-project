package com.avengers.internal.admin;

import java.util.UUID;

public interface AdminCommands {
    AccountResponseDto setAccountSuspended(UUID accountId, boolean suspended, String reason, AdminActor actor);
    InstrumentResponseDto setInstrumentSuspended(UUID instrumentId, boolean suspended, String reason, AdminActor actor);
}
