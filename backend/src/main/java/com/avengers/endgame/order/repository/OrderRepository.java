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

// Owner: order domain (data access). Spring Data JPA writes the implementation at startup,
//   building most queries from the method names.
// Ownership: an order belongs to a trading account (accountId), and the account belongs to a user.
//   Client-facing reads go through OrderService, which only uses the user-scoped lookups or checks the
//   account's owner first. Unscoped methods (findByStatus..., findByIdForUpdate) are for OrderService's
//   own checks and the background execution worker, which acts for no particular user.
public interface OrderRepository extends JpaRepository<Order, UUID> {
    List<Order> findByAccountId(UUID accountId);

    List<Order> findByAccountIdOrderByOrderDateDesc(UUID accountId);

    List<Order> findByAccountIdAndStatusIn(UUID accountId, Collection<OrderStatus> statuses);

    // Used by OrderExecutionWorker to find orders waiting to be filled, across all users.
    List<Order> findByStatusOrderByOrderDateAsc(OrderStatus status);

    // SELECT ... FOR UPDATE on one order, so an update/cancel and a fill can't change it at the same time.
    // The lock lasts until the caller's transaction ends.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Order o where o.orderId = :orderId")
    Optional<Order> findByIdForUpdate(@Param("orderId") UUID orderId);

    // Every order on any of this user's trading accounts, newest first. One query, so it keeps
    // working if clients ever get more than one account.
    @Query("""
            select o from Order o
            where o.accountId in (select a.accountId from Account a where a.user.userId = :userId)
            order by o.orderDate desc
            """)
    List<Order> findAllOwnedBy(@Param("userId") UUID userId);
}
