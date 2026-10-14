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

    @Column(precision = 18, scale = 4)
    private BigDecimal quantity;

    @Column(precision = 18, scale = 4)
    private BigDecimal price;

    @Column(precision = 18, scale = 4)
    private BigDecimal limitPrice;

    @Column(precision = 18, scale = 4)
    private BigDecimal stopPrice;

    @Column(precision = 38, scale = 2)
    private BigDecimal reservedCash;

    @Column(nullable = false)
    private boolean stopTriggered;

    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    private String rejectionReason;

    @Column(name = "date_placed")
    private Instant orderDate;

    private Instant updatedAt;

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
