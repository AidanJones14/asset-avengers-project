package com.avengers.endgame.tradingcontrol;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;

class AccountSuspensionWorkerConfigurationTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final AccountSuspensionSchedules schedules = mock(AccountSuspensionSchedules.class);
    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withBean(JdbcTemplate.class, () -> jdbc)
            .withBean(AccountSuspensionSchedules.class, () -> schedules)
            .withUserConfiguration(AccountSuspensionWorker.class);

    @Test
    void schedulingRemainsEnabledByDefault() {
        context.run(application -> assertThat(application).hasSingleBean(AccountSuspensionWorker.class));
    }

    @Test
    void testSettingDisablesWorkerWithoutQueryingOperationalTables() {
        context.withPropertyValues("admin.suspensions.enabled=false").run(application -> {
            assertThat(application).doesNotHaveBean(AccountSuspensionWorker.class);
            verify(jdbc, never()).queryForList(anyString(), eq(java.util.UUID.class));
            verifyNoInteractions(schedules);
        });
    }
}
