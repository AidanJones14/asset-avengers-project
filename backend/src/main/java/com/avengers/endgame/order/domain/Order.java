package com.avengers.endgame.order.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(name = "orders")
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID orderId;

    private UUID accountId;

    private UUID instrumentId;

    @Enumerated(EnumType.STRING)
    private OrderType orderType;

    @Enumerated(EnumType.STRING)
    private OrderSide orderSide;

    private BigDecimal quantity;

    private BigDecimal price;

    private BigDecimal limitPrice;

    private BigDecimal stopPrice;

    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    private String rejectionReason;

    private Instant orderDate;

    private Instant updatedAt;

    private Instant datePlaced;

    private Instant dateFinalized;

    public Order(
            UUID accountId,
            UUID instrumentId,
            OrderType orderType,
            OrderSide orderSide,
            BigDecimal quantity,
            BigDecimal limitPrice,
            BigDecimal stopPrice
    ) {
        this.accountId = accountId;
        this.instrumentId = instrumentId;
        this.orderType = orderType;
        this.orderSide = orderSide;
        this.quantity = quantity;
        this.limitPrice = limitPrice;
        this.stopPrice = stopPrice;
        this.status = OrderStatus.submitted;
        this.orderDate = Instant.now();
        this.updatedAt = Instant.now();
    }
}
