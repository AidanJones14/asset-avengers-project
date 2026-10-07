package com.avengers.endgame.order.dto;

import com.avengers.endgame.order.domain.OrderSide;
import com.avengers.endgame.order.domain.OrderType;

import java.math.BigDecimal;
import java.util.UUID;

public record OrderRequestDto(
        UUID accountId,
        UUID instrumentId,
        OrderType orderType,
        OrderSide orderSide,
        BigDecimal quantity,
        BigDecimal limitPrice,
        BigDecimal stopPrice
) {}
