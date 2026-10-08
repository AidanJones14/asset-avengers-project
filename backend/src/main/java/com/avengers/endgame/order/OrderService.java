package com.avengers.endgame.order;

import com.avengers.endgame.instrument.InstrumentRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final OrderMapper orderMapper;
    private final InstrumentRepository instrumentRepository;

    public OrderService(
            OrderRepository orderRepository,
            OrderMapper orderMapper,
            InstrumentRepository instrumentRepository) {
        this.orderRepository = orderRepository;
        this.orderMapper = orderMapper;
        this.instrumentRepository = instrumentRepository;
    }

    public List<OrderResponseDto> getAllOrders() {
        return orderRepository.findAll().stream().map(orderMapper::toResponse).toList();
    }

    public List<OrderResponseDto> getOrdersByAccountId(UUID accountId) {
        return orderRepository.findByAccountIdOrderByOrderDateDesc(accountId).stream()
                .map(orderMapper::toResponse)
                .toList();
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
        UUID instrumentId = request.instrumentId();
        if (instrumentId == null) {
            if (request.symbol() == null || request.symbol().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "instrumentId or symbol is required");
            }
            instrumentId = instrumentRepository.findBySymbol(request.symbol().trim().toUpperCase())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Unknown instrument symbol " + request.symbol()
                    ))
                    .getInstrumentId();
        }
        OrderRequestDto resolvedRequest = new OrderRequestDto(
                request.accountId(), instrumentId, request.symbol(), request.orderType(),
                request.orderSide(), request.quantity(), request.limitPrice(), request.stopPrice());
        Order order = orderMapper.toEntity(resolvedRequest);
        order.setStatus(OrderStatus.submitted);
        order.setOrderDate(Instant.now());
        Order savedOrder = orderRepository.save(order);
        return orderMapper.toResponse(savedOrder);
    }

    public OrderResponseDto updatePrice(UUID orderId, BigDecimal price) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Order with ID " + orderId + " not found"
                ));

        if (order.getOrderType() == OrderType.market) {
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

        if (order.getStatus() != OrderStatus.submitted) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Order has to be pending to be cancelled"
            );
        }

        order.setStatus(OrderStatus.cancelled);
        Order cancelledOrder = orderRepository.save(order);
        return orderMapper.toResponse(cancelledOrder);
    }
}
