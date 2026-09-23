package com.avengers.endgame.order;

import java.time.Instant;

public class Order {
    private String orderId;
    private String orderType;
    private String side;
    private int quantity;
    private double limitPrice;
    private Instant submittedAt;

    public Order() {}
}
