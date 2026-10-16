package com.avengers.internal.admin;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

// Shared helpers for the admin_analytics queries.
final class AdminSql {

    private AdminSql() {
    }

    // fromWhere is everything from FROM onwards, without ORDER BY.
    static <T> AdminPage<T> page(NamedParameterJdbcTemplate jdbc, String fromWhere, String orderBy,
                                 MapSqlParameterSource params, AdminPageRequest page, RowMapper<T> mapper) {
        Long total = jdbc.queryForObject("SELECT count(*) " + fromWhere, params, Long.class);
        if (total == null || total == 0) {
            return AdminPage.of(List.of(), page, 0);
        }
        params.addValue("limit", page.size()).addValue("offset", page.offset());
        List<T> items = jdbc.query("SELECT * " + fromWhere + " ORDER BY " + orderBy
                + " LIMIT :limit OFFSET :offset", params, mapper);
        return AdminPage.of(items, page, total);
    }

    static String where(List<String> conditions) {
        return conditions.isEmpty() ? "" : " WHERE " + String.join(" AND ", conditions);
    }

    static UUID uuid(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, UUID.class);
    }

    static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }
}
