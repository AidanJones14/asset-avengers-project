package com.avengers.endgame.order.repository;

import com.avengers.endgame.order.domain.OrderSubmissionKey;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface OrderSubmissionKeyRepository extends JpaRepository<OrderSubmissionKey, UUID> {
    Optional<OrderSubmissionKey> findByUserIdAndRequestKey(UUID userId, UUID requestKey);
}
