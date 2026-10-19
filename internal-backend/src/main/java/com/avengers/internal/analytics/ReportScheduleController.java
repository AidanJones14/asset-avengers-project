package com.avengers.internal.analytics;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/analytics/report-schedule")
public class ReportScheduleController {
    private final ReportScheduleService schedules;
    public ReportScheduleController(ReportScheduleService schedules) { this.schedules = schedules; }
    public record Request(@NotNull @Pattern(regexp = "(?:[01][0-9]|2[0-3]):[0-5][0-9]",
            message = "Use HH:mm in New York time")
            @Pattern(regexp = "(?!00:00).*", message = "Choose a time from 00:01 through 23:59") String localTime) {}
    @GetMapping
    public ReportScheduleService.Schedule get() { return schedules.get(); }
    @PutMapping
    public ReportScheduleService.Schedule save(@Valid @RequestBody Request request, @AuthenticationPrincipal Jwt jwt) {
        if (jwt == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        UUID actor;
        try { actor = UUID.fromString(jwt.getSubject()); }
        catch (IllegalArgumentException error) { throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid user identity"); }
        return schedules.save(request.localTime(), actor);
    }
}
