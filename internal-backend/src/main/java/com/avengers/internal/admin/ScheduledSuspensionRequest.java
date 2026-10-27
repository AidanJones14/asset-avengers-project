package com.avengers.internal.admin;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Future;
import java.time.Instant;

public record ScheduledSuspensionRequest(
        @NotBlank @Size(max = 1000) String reason,
        @NotNull @Future Instant suspendAt) {}
