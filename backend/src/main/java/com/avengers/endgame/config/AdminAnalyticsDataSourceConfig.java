package com.avengers.endgame.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import javax.sql.DataSource;

// Connection to the admin_analytics database (DB/admin_analytics_db.schema.sql).
// Both beans are defaultCandidate = false, so Spring Boot still auto-configures the
// trading DataSource, JPA and JdbcTemplate exactly as before; inject these with
// @Qualifier(ADMIN_ANALYTICS).
@Configuration
public class AdminAnalyticsDataSourceConfig {

    public static final String ADMIN_ANALYTICS = "adminAnalytics";

    @Bean(defaultCandidate = false, destroyMethod = "close")
    @Qualifier(ADMIN_ANALYTICS)
    public HikariDataSource adminAnalyticsDataSource(
            @Value("${admin-analytics.datasource.url}") String url,
            @Value("${admin-analytics.datasource.username}") String username,
            @Value("${admin-analytics.datasource.password}") String password) {
        // Hikari connects on first use, so the app starts even if this database is down.
        HikariDataSource dataSource = new HikariDataSource();
        dataSource.setPoolName("admin-analytics");
        dataSource.setJdbcUrl(url);
        dataSource.setUsername(username);
        dataSource.setPassword(password);
        return dataSource;
    }

    @Bean(defaultCandidate = false)
    @Qualifier(ADMIN_ANALYTICS)
    public NamedParameterJdbcTemplate adminAnalyticsJdbc(@Qualifier(ADMIN_ANALYTICS) DataSource dataSource) {
        return new NamedParameterJdbcTemplate(dataSource);
    }
}
