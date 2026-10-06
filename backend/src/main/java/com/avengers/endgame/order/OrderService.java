package com.avengers.endgame.order;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final OrderMapper orderMapper;

    public OrderService(
            OrderRepository orderRepository,
            OrderMapper orderMapper) {
        this.orderRepository = orderRepository;
        this.orderMapper = orderMapper;
    }

    public List<OrderResponseDto> getAllOrders() {
        return orderRepository.findAll().stream().map(orderMapper::toResponse).toList();
    }

    public OrderResponseDto getOrderById(UUID orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Order with ID " + orderId + " not found"
                ));
        return orderMapper.toResponse(order);
    }

    public OrderResponseDto createOrder(OrderRequestDto request) {
        Order order = orderMapper.toEntity(request);
        order.setStatus(OrderStatus.PENDING);
        order.setSubmittedAt(Instant.now());
        Order savedOrder = orderRepository.save(order);
        return orderMapper.toResponse(savedOrder);
    }

    public OrderResponseDto updatePrice(UUID orderId, Double price) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Order with ID " + orderId + " not found"
                ));

        if (order.getOrderType() == OrderType.MARKET) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Cannot update price for market orders"
            );
        }

        order.setPrice(price);
        Order updatedOrder = orderRepository.save(order);
        return orderMapper.toResponse(updatedOrder);
    }

    public OrderResponseDto cancelOrder(UUID orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Order with ID " + orderId + " not found"
                ));

        if (order.getStatus() != OrderStatus.PENDING) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Order has to be pending to be cancelled"
            );
        }

        order.setStatus(OrderStatus.CANCELLED);
        Order cancelledOrder = orderRepository.save(order);
        return orderMapper.toResponse(cancelledOrder);
    }
}
