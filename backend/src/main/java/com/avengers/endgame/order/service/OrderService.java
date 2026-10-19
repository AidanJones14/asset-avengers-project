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

// Owner: order domain (service layer). Places, reads, re-prices and cancels a client's orders.
// Used by: OrderController (/api/v1/orders). Filling orders is OrderExecutionService's job, not this class's.
// Saves client commitments: an accepted order the execution worker settles later, or a rejected one
//   (not enough cash). OrderAuditRecorder keeps the quote each submission was priced with.
// Ownership is built in: every public method takes the caller's userId (from the token, via
//   @CurrentUserId) and only ever touches orders on that user's own accounts. There is no unscoped
//   public method, so a new endpoint can't accidentally read or change someone else's order.
// "Not yours" and "doesn't exist" give the same 404 with the same message, so a caller can't
//   learn that another client's order exists (spec: docs/endgame-api.yaml, GET /me/orders/{orderId}).
@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final OrderMapper orderMapper;
    private final OrderValidator orderValidator;
    private final AccountRepository accountRepository;
    private final InstrumentService instrumentService;
    private final OrderAuditRecorder audit;

    // Constructor injection: Spring passes in these beans when it creates the service.
    public OrderService(
            OrderRepository orderRepository,
            OrderMapper orderMapper,
            OrderValidator orderValidator,
            AccountRepository accountRepository,
            InstrumentService instrumentService,
            OrderAuditRecorder audit) {
        this.orderRepository = orderRepository;
        this.orderMapper = orderMapper;
        this.orderValidator = orderValidator;
        this.accountRepository = accountRepository;
        this.instrumentService = instrumentService;
        this.audit = audit;
    }

    // The caller's orders, newest first: all of them, or only one of their accounts' when accountId is given.
    @Transactional(readOnly = true)
    public List<OrderResponseDto> getOrders(UUID userId, UUID accountId) {
        // 1. No filter: one query for every order on the caller's accounts.
        if (accountId == null) {
            return orderRepository.findAllOwnedBy(userId).stream().map(orderMapper::toResponse).toList();
        }
        // 2. Filtered: the account must be the caller's (404 otherwise), then list its orders.
        requireOwnedAccount(userId, accountId);
        return orderRepository.findByAccountIdOrderByOrderDateDesc(accountId).stream()
                .map(orderMapper::toResponse)
                .toList();
    }

    // One of the caller's orders.
    @Transactional(readOnly = true)
    public OrderResponseDto getOrderById(UUID userId, UUID orderId) {
        // Load the order, keep it only if it's on one of the caller's accounts, else the same 404 as missing.
        Order order = orderRepository.findById(orderId)
                .filter(found -> isOwnedBy(found, userId))
                .orElseThrow(() -> orderNotFound(orderId));
        return orderMapper.toResponse(order);
    }

    // Places an order on one of the caller's accounts.
    @Transactional
    public OrderResponseDto createOrder(UUID userId, OrderRequestDto request) {
        // 1. The accountId in the body must belong to the caller: 400 if missing, 404 if not theirs.
        //    This runs first, so nothing below ever validates or saves against another client's account.
        requireOwnedAccount(userId, request.accountId());
        // 2. Resolve the instrument: by id, or look up (and lazily create) it by symbol.
        UUID instrumentId = request.instrumentId();
        if (instrumentId == null) {
            if (request.symbol() == null || request.symbol().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "instrumentId or symbol is required");
            }
            instrumentId = instrumentService.getInstrumentBySymbol(request.symbol()).instrumentId();
        }
        // 3. Business rules (cash, holdings, prices) live in OrderValidator. It returns the cash to reserve,
        //    the quote it priced the order with, and a rejection reason when the only problem is not enough
        //    cash. Every other broken rule still throws (400).
        OrderRequestDto resolvedRequest = new OrderRequestDto(
                request.accountId(), instrumentId, request.symbol(), request.orderType(),
                request.orderSide(), request.quantity(), request.limitPrice(), request.stopPrice());
        OrderValidator.Validation validation = orderValidator.validateSubmission(resolvedRequest);
        // 4. Save it: accepted (the execution worker fills it later), or first as submitted when it will be
        //    rejected. Not enough cash is not an error: the order is kept, rejected, so it shows in the
        //    client's history and the audit trail.
        boolean rejected = validation.rejectionReason() != null;
        Order order = orderMapper.toEntity(resolvedRequest);
        order.setReservedCash(validation.reservedCash());
        order.setStatus(rejected ? OrderStatus.submitted : OrderStatus.accepted);
        order.setOrderDate(Instant.now());
        // SQL captures the submitted event/outbox on insertion. A rejected order is flushed as submitted
        // first, so SQL records both lifecycle events in this same account-locked transaction.
        Order savedOrder = rejected ? orderRepository.saveAndFlush(order) : orderRepository.save(order);
        // 5. Keep the quote validation used as pricing evidence, instead of paying for another
        //    (possibly different) quote.
        audit.observed(savedOrder.getOrderId(), "submission", validation.quote());
        // 6. Rejected: finalize it with the reason and release the reservation.
        if (rejected) {
            savedOrder.setStatus(OrderStatus.rejected);
            savedOrder.setRejectionReason(validation.rejectionReason());
            savedOrder.setReservedCash(BigDecimal.ZERO);
            savedOrder.setDateFinalized(Instant.now());
            savedOrder = orderRepository.saveAndFlush(savedOrder);
        }
        return orderMapper.toResponse(savedOrder);
    }

    // Changes the limit (or, for stop orders, the trigger) price of one of the caller's open orders.
    @Transactional
    public OrderResponseDto updatePrice(UUID userId, UUID orderId, BigDecimal price) {
        Order order = lockEditableOrder(userId, orderId);
        // The existing PATCH {price} contract changes the trigger for stop orders,
        // and the limit for limit/stop-limit orders. Execution price is never edited.
        BigDecimal limitPrice = order.getOrderType() == OrderType.stop ? null : price;
        BigDecimal stopPrice = order.getOrderType() == OrderType.stop ? price : order.getStopPrice();
        return replacePrices(order, limitPrice, stopPrice);
    }

    /** Changes the given prices; a null argument keeps that price unchanged. */
    @Transactional
    public OrderResponseDto updatePrices(UUID userId, UUID orderId, BigDecimal limitPrice, BigDecimal stopPrice) {
        Order order = lockEditableOrder(userId, orderId);
        if (stopPrice != null && order.isStopTriggered() && stopPrice.compareTo(order.getStopPrice()) != 0) {
            throw new OrderValidationException("The stop price cannot be changed after the stop has triggered");
        }
        // The validator rejects a price the order type does not use, e.g. a stop on a limit order.
        return replacePrices(order,
                limitPrice != null ? limitPrice : order.getLimitPrice(),
                stopPrice != null ? stopPrice : order.getStopPrice());
    }

    // Locks one of the caller's open, non-market orders so a fill can't happen mid-update.
    private Order lockEditableOrder(UUID userId, UUID orderId) {
        // 1. Lock the order row, and keep it only if it's the caller's.
        Order order = orderRepository.findByIdForUpdate(orderId)
                .filter(found -> isOwnedBy(found, userId))
                .orElseThrow(() -> orderNotFound(orderId));

        // 2. Market orders have no price to change, and only open orders can change.
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
        // 4. Re-validate with the new price; this recalculates the cash to reserve.
        BigDecimal reservedCash = orderValidator.validateOrderUpdate(candidate, orderId);
        order.setLimitPrice(limitPrice);
        order.setStopPrice(stopPrice);
        order.setReservedCash(reservedCash);
        order.setUpdatedAt(Instant.now());
        Order updatedOrder = orderRepository.save(order);
        return orderMapper.toResponse(updatedOrder);
    }

    // Cancels one of the caller's open orders. Recorded as a status change; the row is never deleted.
    @Transactional
    public OrderResponseDto cancelOrder(UUID userId, UUID orderId) {
        // 1. Lock the order row, and keep it only if it's the caller's.
        Order order = orderRepository.findByIdForUpdate(orderId)
                .filter(found -> isOwnedBy(found, userId))
                .orElseThrow(() -> orderNotFound(orderId));

        // 2. Only open orders can be cancelled.
        if (!isOpen(order)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Only open orders can be cancelled"
            );
        }

        // 3. Lock the account too, so releasing the reserved cash can't race a deposit/withdrawal or fill.
        accountRepository.findByIdForUpdate(order.getAccountId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found"));
        order.setStatus(OrderStatus.cancelled);
        order.setReservedCash(BigDecimal.ZERO);
        order.setUpdatedAt(Instant.now());
        order.setDateFinalized(Instant.now());
        Order cancelledOrder = orderRepository.save(order);
        return orderMapper.toResponse(cancelledOrder);
    }

    // The account named in a request must belong to the caller.
    // Missing → 400 (a malformed request). Not the caller's (or nonexistent) → 404, without revealing which.
    private void requireOwnedAccount(UUID userId, UUID accountId) {
        if (accountId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Account ID is required");
        }
        if (!accountRepository.existsByAccountIdAndUserUserId(accountId, userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found");
        }
    }

    // An order is the caller's when the account it was placed on is the caller's.
    private boolean isOwnedBy(Order order, UUID userId) {
        return accountRepository.existsByAccountIdAndUserUserId(order.getAccountId(), userId);
    }

    // The one 404 for "no such order" and "not your order", so the two can't be told apart.
    private static ResponseStatusException orderNotFound(UUID orderId) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Order with ID " + orderId + " not found");
    }

    private boolean isOpen(Order order) {
        return order.getStatus() == OrderStatus.submitted || order.getStatus() == OrderStatus.accepted;
    }
}
