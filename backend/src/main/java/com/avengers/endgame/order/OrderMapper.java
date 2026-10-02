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
                dto.price()
        );
    }

    public OrderResponseDto toResponse(Order order) {
        return new OrderResponseDto(
                order.getOrderId(),
                order.getAccountId(),
                order.getInstrumentId(),
                order.getOrderType(),
                order.getSide(),
                order.getQuantity(),
                order.getPrice(),
                order.getStatus(),
                order.getSubmittedAt()
        );
    }
}
