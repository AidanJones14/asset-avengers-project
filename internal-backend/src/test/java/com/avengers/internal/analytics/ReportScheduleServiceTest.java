package com.avengers.internal.analytics;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ReportScheduleServiceTest {
    @Test void appendsActorAndNextLocalDayWithoutChangingTodaysReport() {
        var jdbc = mock(NamedParameterJdbcTemplate.class);
        when(jdbc.getJdbcTemplate()).thenReturn(mock(JdbcTemplate.class));
        // UTC is already October 16; New York is still October 15.
        var clock = Clock.fixed(Instant.parse("2026-10-16T01:00:00Z"),ZoneOffset.UTC);
        var service = new ReportScheduleService(jdbc,clock);
        var actor = UUID.randomUUID();
        service.save("17:30",actor);
        verify(jdbc).update(contains("INSERT INTO integration.report_schedules"),argThat((Map<String,?> params) ->
                params.get("actor").equals(actor) && params.get("time").equals("17:30")
                && params.get("effective").equals(LocalDate.of(2026,10,16))));
        var result = service.get();
        assertEquals("19:00",result.currentLocalTime());
        assertEquals(LocalDate.of(2026,10,16),result.effectiveFrom());
    }
}
