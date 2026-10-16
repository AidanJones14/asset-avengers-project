package com.avengers.endgame.order.service;

import com.avengers.endgame.order.domain.OrderPricingEvidence;
import com.avengers.endgame.order.repository.OrderPricingEvidenceRepository;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import tools.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

/** Preserves the original observation; SQL later forwards it through the outbox to staff. */
@Service
public class OrderAuditRecorder {
    private final OrderPricingEvidenceRepository repository;
    private final ObjectMapper json;

    public OrderAuditRecorder(OrderPricingEvidenceRepository repository, ObjectMapper json) {
        this.repository=repository;
        this.json=json;
    }

    // A successful observation is useful only with its source business transaction.
    // MANDATORY prevents callers accidentally saving it outside that transaction.
    @Transactional(propagation=Propagation.MANDATORY)
    public void observed(UUID orderId, String phase, QuoteResponse quote) {
        if (quote != null) save(orderId,phase,"observed",quote,null);
    }

    // Preserve the failed attempt even when the execution transaction rolls back.
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void rejected(UUID orderId, QuoteResponse quote, String reason) {
        save(orderId,"execution","rejected",quote,reason);
    }

    private void save(UUID orderId,String phase,String decision,QuoteResponse quote,String reason) {
        repository.save(new OrderPricingEvidence(orderId,phase,decision,
                quote == null ? null : json.writeValueAsString(quote),reason));
    }
}
