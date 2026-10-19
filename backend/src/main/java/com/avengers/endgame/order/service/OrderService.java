package com.avengers.endgame.order.service;

import com.avengers.endgame.exception.OrderValidationException;
import com.avengers.endgame.order.domain.Order;
import com.avengers.endgame.order.domain.OrderStatus;
import com.avengers.endgame.order.domain.OrderType;
import com.avengers.endgame.order.dto.OrderRequestDto;
import com.avengers.endgame.order.dto.OrderResponseDto;
import com.avengers.endgame.order.mapper.OrderMapper;
import com.avengers.endgame.order.repository.OrderRepository;
import com.avengers.endgame.order.validator.OrderValidator;
import com.avengers.endgame.account.AccountRepository;
import com.avengers.endgame.instrument.InstrumentService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Saves client commitments; the separate execution worker settles accepted orders later. */
@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final OrderMapper orderMapper;
    private final OrderValidator orderValidator;
    private final AccountRepository accountRepository;
    private final InstrumentService instrumentService;
    private final OrderAuditRecorder audit;

    public OrderService(
            OrderRepository orderRepository,
            OrderMapper orderMapper,
            OrderValidator orderValidator,
            AccountRepository accountRepository,
            InstrumentService instrumentService, OrderAuditRecorder audit) {
        this.orderRepository = orderRepository;
        this.orderMapper = orderMapper;
        this.orderValidator = orderValidator;
        this.accountRepository = accountRepository;
        this.instrumentService = instrumentService;
        this.audit = audit;
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

    @Transactional
    public OrderResponseDto createOrder(OrderRequestDto request) {
        UUID instrumentId = request.instrumentId();
        if (instrumentId == null) {
            if (request.symbol() == null || request.symbol().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "instrumentId or symbol is required");
            }
            instrumentId = instrumentService.getInstrumentBySymbol(request.symbol()).instrumentId();
        }
        OrderRequestDto resolvedRequest = new OrderRequestDto(
                request.accountId(), instrumentId, request.symbol(), request.orderType(),
                request.orderSide(), request.quantity(), request.limitPrice(), request.stopPrice());
        var validation = orderValidator.validateSubmission(resolvedRequest);
        BigDecimal reservedCash = validation.reservedCash();
        Order order = orderMapper.toEntity(resolvedRequest);
        order.setReservedCash(reservedCash);
        boolean rejected = validation.rejectionReason() != null;
        order.setStatus(rejected ? OrderStatus.submitted : OrderStatus.accepted);
        order.setOrderDate(Instant.now());
        // SQL captures the submitted event/outbox on insertion. Keep this quote
        // from validation instead of paying for another, potentially different quote.
        // A rejected submission is still an order: flush submitted first so SQL
        // captures both lifecycle events in the same account-locked transaction.
        Order savedOrder = rejected ? orderRepository.saveAndFlush(order) : orderRepository.save(order);
        audit.observed(savedOrder.getOrderId(), "submission", validation.quote());
        if (rejected) {
            savedOrder.setStatus(OrderStatus.rejected);
            savedOrder.setRejectionReason(validation.rejectionReason());
            savedOrder.setReservedCash(BigDecimal.ZERO);
            savedOrder.setDateFinalized(Instant.now());
            savedOrder = orderRepository.saveAndFlush(savedOrder);
        }
        return orderMapper.toResponse(savedOrder);
    }

    @Transactional
    public OrderResponseDto updatePrice(UUID orderId, BigDecimal price) {
        Order order = lockEditableOrder(orderId);
        // The existing PATCH {price} contract changes the trigger for stop orders,
        // and the limit for limit/stop-limit orders. Execution price is never edited.
        BigDecimal limitPrice = order.getOrderType() == OrderType.stop ? null : price;
        BigDecimal stopPrice = order.getOrderType() == OrderType.stop ? price : order.getStopPrice();
        return replacePrices(order, limitPrice, stopPrice);
    }

    /** Changes the given prices; a null argument keeps that price unchanged. */
    @Transactional
    public OrderResponseDto updatePrices(UUID orderId, BigDecimal limitPrice, BigDecimal stopPrice) {
        Order order = lockEditableOrder(orderId);
        if (stopPrice != null && order.isStopTriggered() && stopPrice.compareTo(order.getStopPrice()) != 0) {
            throw new OrderValidationException("The stop price cannot be changed after the stop has triggered");
        }
        // The validator rejects a price the order type does not use, e.g. a stop on a limit order.
        return replacePrices(order,
                limitPrice != null ? limitPrice : order.getLimitPrice(),
                stopPrice != null ? stopPrice : order.getStopPrice());
    }

    private Order lockEditableOrder(UUID orderId) {
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
        return order;
    }

    private OrderResponseDto replacePrices(Order order, BigDecimal limitPrice, BigDecimal stopPrice) {
        UUID orderId = order.getOrderId();
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
