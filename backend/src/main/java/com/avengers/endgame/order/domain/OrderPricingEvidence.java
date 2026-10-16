package com.avengers.endgame.order.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;
import java.time.Instant;
import java.util.UUID;

@Entity
@Immutable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(name = "order_pricing_evidence")
public class OrderPricingEvidence {
    @Id private UUID evidenceId;
    @Column(nullable=false) private UUID orderId;
    @Column(nullable=false, length=20) private String phase;
    @Column(nullable=false, length=30) private String decision;
    @Column(columnDefinition="text") private String reason;
    @Column(columnDefinition="text") private String quoteJson;
    @Column(nullable=false) private Instant observedAt;

    public OrderPricingEvidence(UUID orderId, String phase, String decision, String quoteJson, String reason) {
        this.evidenceId=UUID.randomUUID();
        this.orderId=orderId;
        this.phase=phase;
        this.decision=decision;
        this.quoteJson=quoteJson;
        this.reason=reason;
        this.observedAt=Instant.now();
    }
}
