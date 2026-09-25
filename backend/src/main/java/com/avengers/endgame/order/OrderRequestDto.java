package com.avengers.endgame.order;

import java.util.UUID;

public record OrderRequestDto(
        UUID accountId,
        UUID instrumentId,
        OrderType orderType,
        OrderSide orderSide,
        double quantity,
        Double price
) {}
