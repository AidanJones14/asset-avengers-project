package com.avengers.internal.analytics;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class ReportingClockConfig {
    @Bean
    Clock reportingClock() { return Clock.systemUTC(); }
}
