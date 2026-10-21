package com.avengers.internal.admin;


import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

// One order with its current status, from admin.trades.
public record AdminOrderDto(
        UUID orderId,
        UUID clientId,
        UUID accountId,
        String symbol,
        OrderSide orderSide,
        OrderType orderType,
        BigDecimal quantity,
        BigDecimal limitPrice,
        BigDecimal stopPrice,
        OrderStatus status,
        Instant placedAt,
        Instant acceptedAt,
        Instant submittedAt,
        Instant filledAt,
        BigDecimal fillPrice,
        Instant rejectedAt,
        String rejectionReason,
        Instant cancelledAt,
        BigDecimal cashChange,
        BigDecimal holdingChange,
        String clientName,
        String accountName,
        String accountType
) {
    public AdminOrderDto(
        UUID orderId,
        UUID clientId,
        UUID accountId,
        String symbol,
        OrderSide orderSide,
        OrderType orderType,
        BigDecimal quantity,
        BigDecimal limitPrice,
        BigDecimal stopPrice,
        OrderStatus status,
        Instant placedAt,
        Instant acceptedAt,
        Instant submittedAt,
        Instant filledAt,
        BigDecimal fillPrice,
        Instant rejectedAt,
        String rejectionReason,
        Instant cancelledAt,
        BigDecimal cashChange,
        BigDecimal holdingChange,
        String clientName
) {
        this(orderId,clientId,accountId,symbol,orderSide,orderType,quantity,limitPrice,stopPrice,status,placedAt,acceptedAt,submittedAt,filledAt,fillPrice,rejectedAt,rejectionReason,cancelledAt,cashChange,holdingChange,clientName,null,null);
    }
}
