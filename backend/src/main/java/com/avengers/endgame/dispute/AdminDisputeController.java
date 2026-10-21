package com.avengers.endgame.dispute;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

/** Live intake read, restricted to ADMIN by SecurityConfig. */
@RestController
@RequestMapping("/api/v1/admin/disputes")
@RequiredArgsConstructor
public class AdminDisputeController {
    private final JdbcTemplate jdbc;

    @GetMapping
    public List<Map<String, Object>> list(@RequestParam(defaultValue = "0") int page) {
        if (page < 0 || page > 1000000)
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Invalid page");
        return jdbc.queryForList("""
            SELECT d.dispute_id AS "disputeId", d.account_id AS "accountId",
                   a.account_name AS "accountName",a.account_type AS "accountType",
                   d.order_id AS "orderId", d.category, d.description, d.status,
                   d.created_at AS "createdAt", u.name AS "clientName", u.email,
                   i.symbol, o.order_side AS "side", o.quantity,
                   o.date_placed AS "orderDate"
            FROM client_disputes d JOIN accounts a USING(account_id)
            JOIN users u ON u.user_id = a.user_id
            LEFT JOIN orders o ON o.order_id = d.order_id
            LEFT JOIN instruments i ON i.instrument_id = o.instrument_id
            ORDER BY d.created_at DESC, d.dispute_id DESC LIMIT 26 OFFSET ?
            """, page * 25);
    }
}
