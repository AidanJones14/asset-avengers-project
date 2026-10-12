package com.avengers.endgame.order.service;

import com.avengers.endgame.order.domain.Order;
import com.avengers.endgame.order.domain.OrderStatus;
import com.avengers.endgame.order.domain.OrderType;
import com.avengers.endgame.order.dto.OrderRequestDto;
import com.avengers.endgame.order.dto.OrderResponseDto;
import com.avengers.endgame.order.mapper.OrderMapper;
import com.avengers.endgame.order.repository.OrderRepository;
import com.avengers.endgame.order.validator.OrderValidator;
import com.avengers.endgame.account.AccountRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final OrderMapper orderMapper;
    private final OrderValidator orderValidator;
    private final AccountRepository accountRepository;

    public OrderService(
            OrderRepository orderRepository,
            OrderMapper orderMapper,
            OrderValidator orderValidator,
            AccountRepository accountRepository) {
        this.orderRepository = orderRepository;
        this.orderMapper = orderMapper;
        this.orderValidator = orderValidator;
        this.accountRepository = accountRepository;
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

    @Transactional
    public OrderResponseDto createOrder(OrderRequestDto request) {
        BigDecimal reservedCash = orderValidator.validateOrderRequest(request);
        Order order = orderMapper.toEntity(request);
        order.setReservedCash(reservedCash);
        order.setStatus(OrderStatus.accepted);
        order.setOrderDate(Instant.now());
        Order savedOrder = orderRepository.save(order);
        return orderMapper.toResponse(savedOrder);
    }

    @Transactional
    public OrderResponseDto updatePrice(UUID orderId, BigDecimal price) {
        Order order = orderRepository.findByIdForUpdate(orderId)
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

        if (!isOpen(order)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only open orders can be updated");
        }

        // The existing PATCH {price} contract changes the trigger for stop orders,
        // and the limit for limit/stop-limit orders. Execution price is never edited.
        BigDecimal limitPrice = order.getOrderType() == OrderType.stop ? null : price;
        BigDecimal stopPrice = order.getOrderType() == OrderType.stop ? price : order.getStopPrice();
        OrderRequestDto candidate = new OrderRequestDto(order.getAccountId(), order.getInstrumentId(),
                order.getOrderType(), order.getOrderSide(), order.getQuantity(), limitPrice, stopPrice);
        BigDecimal reservedCash = orderValidator.validateOrderUpdate(candidate, orderId);
        order.setLimitPrice(limitPrice);
        order.setStopPrice(stopPrice);
        order.setReservedCash(reservedCash);
        order.setUpdatedAt(Instant.now());
        Order updatedOrder = orderRepository.save(order);
        return orderMapper.toResponse(updatedOrder);
    }

    @Transactional
    public OrderResponseDto cancelOrder(UUID orderId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Order with ID " + orderId + " not found"
                ));

        if (!isOpen(order)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Only open orders can be cancelled"
            );
        }

        accountRepository.findByIdForUpdate(order.getAccountId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found"));
        order.setStatus(OrderStatus.cancelled);
        order.setReservedCash(BigDecimal.ZERO);
        order.setUpdatedAt(Instant.now());
        order.setDateFinalized(Instant.now());
        Order cancelledOrder = orderRepository.save(order);
        return orderMapper.toResponse(cancelledOrder);
    }

    private boolean isOpen(Order order) {
        return order.getStatus() == OrderStatus.submitted || order.getStatus() == OrderStatus.accepted;
    }
}
