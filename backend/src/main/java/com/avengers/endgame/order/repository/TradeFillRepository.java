package com.avengers.endgame.order.repository;

import com.avengers.endgame.order.domain.TradeFill;
import org.springframework.data.repository.Repository;

import java.util.Optional;
import java.util.UUID;

// No update/delete API: fills are the permanent record of execution.
public interface TradeFillRepository extends Repository<TradeFill, UUID> {
    java.util.List<TradeFill> findByAccountIdOrderByExecutedAtAsc(UUID accountId);
    TradeFill save(TradeFill fill);
    Optional<TradeFill> findByOrderId(UUID orderId);
}
