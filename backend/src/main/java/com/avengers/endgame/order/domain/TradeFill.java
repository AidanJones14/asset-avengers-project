package com.avengers.endgame.order.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Immutable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(name = "trade_fills")
public class TradeFill {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID fillId;

    @Column(nullable = false, unique = true)
    private UUID orderId;

    @Column(nullable = false)
    private UUID accountId;

    @Column(nullable = false)
    private UUID instrumentId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrderSide orderSide;

    @Column(nullable = false, precision = 18, scale = 4)
    private BigDecimal quantity;

    @Column(nullable = false, precision = 18, scale = 4)
    private BigDecimal price;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal cashAmount;

    @Column(nullable = false)
    private Instant executedAt;

    public TradeFill(Order order, BigDecimal price, BigDecimal cashAmount, Instant executedAt) {
        this.orderId = order.getOrderId();
        this.accountId = order.getAccountId();
        this.instrumentId = order.getInstrumentId();
        this.orderSide = order.getOrderSide();
        this.quantity = order.getQuantity();
        this.price = price;
        this.cashAmount = cashAmount;
        this.executedAt = executedAt;
    }
}
