package com.avengers.endgame.dispute;

import com.avengers.endgame.account.AccountService;
import com.avengers.endgame.security.CurrentUserId;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/me/disputes")
@RequiredArgsConstructor
public class DisputeController {
    private final AccountService accounts;
    private final JdbcTemplate jdbc;

    public record Request(UUID orderId,
            @NotBlank @Pattern(regexp = "trade|pricing|funding|other") String category,
            @NotBlank @Size(min = 20, max = 2000) String description) {}
    public record Response(UUID disputeId, UUID orderId, String category, String description,
                           String status, Instant createdAt) {}

    @GetMapping
    @Transactional
    public List<Response> list(@CurrentUserId UUID userId) {
        UUID accountId = accounts.getForUser(userId).accountId();
        return jdbc.query("SELECT * FROM client_disputes WHERE account_id = ? ORDER BY created_at DESC LIMIT 50",
                (rs, row) -> new Response(rs.getObject("dispute_id", UUID.class), rs.getObject("order_id", UUID.class),
                        rs.getString("category"), rs.getString("description"), rs.getString("status"),
                        rs.getTimestamp("created_at").toInstant()), accountId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Response create(@CurrentUserId UUID userId, @Valid @RequestBody Request request) {
        UUID accountId = accounts.getForUser(userId).accountId();
        String description = request.description().strip();
        if (description.length() < 20)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please describe the issue in at least 20 characters");
        if (request.orderId() != null && !Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM orders WHERE order_id = ? AND account_id = ?)",
                Boolean.class, request.orderId(), accountId)))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found in your account");
        UUID id = UUID.randomUUID();
        Instant created = Instant.now();
        jdbc.update("INSERT INTO client_disputes (dispute_id, account_id, order_id, category, description, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                id, accountId, request.orderId(), request.category(), description, java.sql.Timestamp.from(created));
        return new Response(id, request.orderId(), request.category(), description, "submitted", created);
    }
}
