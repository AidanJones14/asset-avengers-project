package com.avengers.internal.admin;

import java.util.UUID;

public interface AdminCommands {
    java.util.Map<String, Object> scheduleAccountSuspension(UUID id, ScheduledSuspensionRequest request, AdminActor actor);
    AccountResponseDto setAccountSuspended(UUID accountId, boolean suspended, String reason, AdminActor actor);
    InstrumentResponseDto setInstrumentSuspended(UUID instrumentId, boolean suspended, String reason, AdminActor actor);
}
