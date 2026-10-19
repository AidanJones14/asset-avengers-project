package com.avengers.internal;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import javax.sql.DataSource;

// Scan this service's admin, analytics, security and common packages only.
// There is no dependency on the client backend and only one reporting datasource.
@SpringBootApplication
public class InternalApplication {
    public static void main(String[] args) {
        var app=new SpringApplication(InternalApplication.class);
        app.run(args);
    }

    @Bean
    @Qualifier("adminAnalytics")
    NamedParameterJdbcTemplate adminJdbc(DataSource dataSource) {
        return new NamedParameterJdbcTemplate(dataSource);
    }
}
