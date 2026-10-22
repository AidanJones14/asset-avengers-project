package com.avengers.endgame.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.availability.AvailabilityChangeEvent;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Test resources intentionally replace application.properties; enable the production
// readiness group explicitly without importing real developer environment settings.
@SpringBootTest(properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.health.DataSourceHealthContributorAutoConfiguration",
        "management.endpoint.health.probes.enabled=true",
        "management.endpoint.health.group.readiness.include=readinessState,db",
        "management.endpoint.health.show-details=never",
        "management.endpoint.health.show-components=never"
})
@AutoConfigureMockMvc
class ReadinessTest {
    @Autowired MockMvc mvc;
    @Autowired ApplicationContext context;
    private static final AtomicReference<Health> DATABASE = new AtomicReference<>(Health.up().build());

    @TestConfiguration(proxyBeanMethods = false)
    static class ControlledDatabaseHealth {
        // Replace only the database health contributor; keep the real HTTP/security path.
        @Bean
        HealthIndicator dbHealthContributor() { return DATABASE::get; }
    }

    @BeforeEach
    void ready() {
        AvailabilityChangeEvent.publish(context, ReadinessState.ACCEPTING_TRAFFIC);
        DATABASE.set(Health.up().build());
    }

    @Test
    void anonymousProbeGetsStatusWithoutDependencyDetails() throws Exception {
        mvc.perform(get("/actuator/health/readiness"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"UP\"}"))
                .andExpect(jsonPath("$.components").doesNotExist());
    }

    @Test
    void databaseFailureReturnsUnavailableWithoutLeakingDetails() throws Exception {
        DATABASE.set(Health.down().withDetail("connection", "private").build());
        mvc.perform(get("/actuator/health/readiness"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(content().json("{\"status\":\"DOWN\"}"))
                .andExpect(jsonPath("$.components").doesNotExist());
    }

    @Test
    void refusingTrafficFailsReadiness() throws Exception {
        AvailabilityChangeEvent.publish(context, ReadinessState.REFUSING_TRAFFIC);
        try {
            mvc.perform(get("/actuator/health/readiness")).andExpect(status().isServiceUnavailable());
        } finally {
            AvailabilityChangeEvent.publish(context, ReadinessState.ACCEPTING_TRAFFIC);
        }
    }

    @Test
    void otherManagementEndpointsRemainProtected() throws Exception {
        mvc.perform(get("/actuator/env")).andExpect(status().isUnauthorized());
        mvc.perform(get("/actuator/health")).andExpect(status().isUnauthorized());
    }
}
