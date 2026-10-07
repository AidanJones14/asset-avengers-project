package com.avengers.endgame.order;

import org.springframework.stereotype.Component;

@Component
public class OrderMapper {

    public Order toEntity(OrderRequestDto dto) {
        return new Order(
                dto.accountId(),
                dto.instrumentId(),
                dto.orderType(),
                dto.orderSide(),
                dto.quantity(),
                dto.limitPrice(),
                dto.stopPrice()
        );
    }

    public OrderResponseDto toResponse(Order order) {
        return new OrderResponseDto(
                order.getOrderId(),
                order.getAccountId(),
                order.getInstrumentId(),
                order.getOrderType(),
                order.getOrderSide(),
                order.getQuantity(),
                order.getPrice(),
                order.getLimitPrice(),
                order.getStopPrice(),
                order.getStatus(),
                order.getOrderDate(),
                order.getUpdatedAt()
        );
    }
}
