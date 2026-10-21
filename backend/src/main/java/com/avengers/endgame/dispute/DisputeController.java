package com.avengers.endgame.dispute;

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
    private final JdbcTemplate jdbc;

    public record Request(UUID orderId,
            @NotBlank @Pattern(regexp = "trade|pricing|funding|other") String category,
            @NotBlank @Size(min = 20, max = 2000) String description, UUID accountId) {}
    public record Response(UUID disputeId, UUID orderId, String category, String description,
                           String status, Instant createdAt, UUID accountId) {}

    @GetMapping
    @Transactional
    public List<Response> list(@CurrentUserId UUID userId) {
        // A client may now own several accounts; never expose another owner's disputes.
        return jdbc.query("""
                SELECT d.* FROM client_disputes d JOIN accounts a USING(account_id)
                WHERE a.user_id=? ORDER BY d.created_at DESC,d.dispute_id LIMIT 50
                """,
                (rs, row) -> new Response(rs.getObject("dispute_id", UUID.class), rs.getObject("order_id", UUID.class),
                        rs.getString("category"), rs.getString("description"), rs.getString("status"),
                        rs.getTimestamp("created_at").toInstant(),rs.getObject("account_id",UUID.class)), userId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Response create(@CurrentUserId UUID userId, @Valid @RequestBody Request request) {
        String description = request.description().strip();
        if (description.length() < 20)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please describe the issue in at least 20 characters");
        UUID accountId = resolveAccount(userId,request);
        UUID id = UUID.randomUUID();
        Instant created = Instant.now();
        jdbc.update("INSERT INTO client_disputes (dispute_id, account_id, order_id, category, description, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                id, accountId, request.orderId(), request.category(), description, java.sql.Timestamp.from(created));
        return new Response(id, request.orderId(), request.category(), description, "submitted", created, accountId);
    }
    private UUID resolveAccount(UUID userId, Request request) {
        // Order-based submissions select the owning account, rather than a default account.
        if (request.orderId()!=null) {
            var ids=jdbc.queryForList("""
                    SELECT o.account_id FROM orders o JOIN accounts a USING(account_id)
                    WHERE o.order_id=? AND a.user_id=?
                    """,UUID.class,request.orderId(),userId);
            if (ids.isEmpty() || (request.accountId()!=null && !request.accountId().equals(ids.getFirst())))
                throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Order not found in your account");
            return ids.getFirst();
        }
        if (request.accountId()!=null) {
            if (!Boolean.TRUE.equals(jdbc.queryForObject(
                    "SELECT EXISTS (SELECT 1 FROM accounts WHERE account_id=? AND user_id=?)",
                    Boolean.class,request.accountId(),userId)))
                throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Account not found");
            return request.accountId();
        }
        var ids=jdbc.queryForList("SELECT account_id FROM accounts WHERE user_id=? ORDER BY account_id LIMIT 2",UUID.class,userId);
        if (ids.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Create a trading account first");
        if (ids.size()>1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Choose an account for this dispute");
        return ids.getFirst();
    }

}
