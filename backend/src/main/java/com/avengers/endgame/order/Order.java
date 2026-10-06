package com.avengers.endgame.order;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

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
    private OrderSide side;

    private double quantity;

    private Double price;

    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    private Instant submittedAt;

    protected Order() {

    }

    public Order(
            UUID accountId,
            UUID instrumentId,
            OrderType orderType,
            OrderSide side,
            double quantity,
            Double price
    ) {
        this.accountId = accountId;
        this.instrumentId = instrumentId;
        this.orderType = orderType;
        this.side = side;
        this.quantity = quantity;
        this.price = price;
    }

    public UUID getOrderId() {
        return orderId;
    }

    public void setOrderId(UUID orderId) {
        this.orderId = orderId;
    }

    public UUID getAccountId() {
        return accountId;
    }

    public void setAccountId(UUID accountId) {
        this.accountId = accountId;
    }

    public UUID getInstrumentId() {
        return instrumentId;
    }

    public void setInstrumentId(UUID instrumentId) {
        this.instrumentId = instrumentId;
    }

    public OrderType getOrderType() {
        return orderType;
    }

    public void setOrderType(OrderType orderType) {
        this.orderType = orderType;
    }

    public OrderSide getSide() {
        return side;
    }

    public void setSide(OrderSide side) {
        this.side = side;
    }

    public double getQuantity() {
        return quantity;
    }

    public void setQuantity(double quantity) {
        this.quantity = quantity;
    }

    public Double getPrice() {
        return price;
    }

    public void setPrice(Double price) {
        this.price = price;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public void setStatus(OrderStatus status) {
        this.status = status;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public void setSubmittedAt(Instant submittedAt) {
        this.submittedAt = submittedAt;
    }
}
