package com.avengers.endgame.order.repository;

import com.avengers.endgame.order.domain.Order;
import com.avengers.endgame.order.domain.OrderStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

// @Repository
public interface OrderRepository extends JpaRepository<Order, UUID> {
    List<Order> findByAccountId(UUID accountId);

    List<Order> findByAccountIdAndStatusIn(UUID accountId, Collection<OrderStatus> statuses);

    List<Order> findByStatusOrderByOrderDateAsc(OrderStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Order o where o.orderId = :orderId")
    Optional<Order> findByIdForUpdate(@Param("orderId") UUID orderId);
}
