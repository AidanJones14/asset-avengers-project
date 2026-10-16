package com.avengers.internal.analytics;

import com.avengers.internal.common.InternalExceptionHandler;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.time.LocalDate;
import java.util.UUID;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ReportScheduleControllerTest {
    ReportScheduleService schedules;
    MockMvc mvc;
    UUID actor = UUID.randomUUID();
    @BeforeEach void setup() {
        schedules = mock(ReportScheduleService.class);
        mvc = MockMvcBuilders.standaloneSetup(new ReportScheduleController(schedules))
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .setControllerAdvice(new InternalExceptionHandler()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(
                Jwt.withTokenValue("test").header("alg","HS256").subject(actor.toString()).build()));
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    @Test void savesTimeUsingVerifiedActor() throws Exception {
        when(schedules.save("17:30",actor)).thenReturn(new ReportScheduleService.Schedule(
                "America/New_York","19:00","17:30", LocalDate.of(2026,10,16)));
        mvc.perform(put("/api/v1/analytics/report-schedule").contentType("application/json").content("{\"localTime\":\"17:30\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("nextLocalTime").value("17:30"))
                .andExpect(jsonPath("effectiveFrom").value("2026-10-16"));
        verify(schedules).save("17:30",actor);
    }
    @ParameterizedTest @ValueSource(strings={"24:00","00:00","17:30:01","7pm","-1:00"})
    void rejectsInvalidTime(String time) throws Exception {
        mvc.perform(put("/api/v1/analytics/report-schedule").contentType("application/json")
                .content("{\"localTime\":\""+time+"\"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(schedules);
    }
    @Test void requiresTime() throws Exception {
        mvc.perform(put("/api/v1/analytics/report-schedule").contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(schedules);
    }
}
