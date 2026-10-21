package com.avengers.endgame.order.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.Instant;
import java.util.UUID;

/** Stored in the same transaction as the order; a rollback consumes neither. */
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(name = "order_submission_keys", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "request_key"}))
public class OrderSubmissionKey {
    @Id private UUID id;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(name = "request_key", nullable = false) private UUID requestKey;
    @Column(nullable = false, length = 64) private String fingerprint;
    @Column(nullable = false) private UUID orderId;
    @Column(nullable = false) private Instant createdAt;

    public OrderSubmissionKey(UUID userId, UUID requestKey, String fingerprint, UUID orderId) {
        this.id = UUID.randomUUID(); this.userId = userId; this.requestKey = requestKey;
        this.fingerprint = fingerprint; this.orderId = orderId; this.createdAt = Instant.now();
    }
}
