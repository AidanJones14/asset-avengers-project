package com.avengers.endgame.order;

import java.time.Instant;
import java.util.UUID;

public class Order {
    private UUID orderId;
    private UUID accountId;
    private UUID instrumentId;
    private OrderType orderType;
    private OrderSide side;
    private double quantity;
    private double price;
    private OrderStatus status;
    private Instant submittedAt;

    public Order() {}
}
