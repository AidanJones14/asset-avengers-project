package com.avengers.endgame.order.repository;

import com.avengers.endgame.order.domain.OrderPricingEvidence;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface OrderPricingEvidenceRepository extends JpaRepository<OrderPricingEvidence, UUID> {}
