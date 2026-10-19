package com.avengers.endgame.order.validator;

import com.avengers.endgame.account.Account;
import com.avengers.endgame.account.AccountRepository;
import com.avengers.endgame.exception.OrderValidationException;
import com.avengers.endgame.holding.Holding;
import com.avengers.endgame.holding.HoldingRepository;
import com.avengers.endgame.instrument.Instrument;
import com.avengers.endgame.instrument.InstrumentRepository;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import com.avengers.endgame.order.domain.Order;
import com.avengers.endgame.order.domain.OrderSide;
import com.avengers.endgame.order.domain.OrderStatus;
import com.avengers.endgame.order.dto.OrderRequestDto;
import com.avengers.endgame.order.repository.OrderRepository;
import com.avengers.endgame.order.service.OrderQuoteService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;

@Component
public class OrderValidator {
    private static final BigDecimal MAX_DECIMAL = new BigDecimal("99999999999999.9999");

    private final AccountRepository accountRepository;
    private final InstrumentRepository instrumentRepository;
    private final HoldingRepository holdingRepository;
    private final OrderRepository orderRepository;
    private final OrderQuoteService orderQuoteService;

    public OrderValidator(AccountRepository accountRepository, InstrumentRepository instrumentRepository,
                          HoldingRepository holdingRepository, OrderRepository orderRepository,
                          OrderQuoteService orderQuoteService) {
        this.accountRepository = accountRepository;
        this.instrumentRepository = instrumentRepository;
        this.holdingRepository = holdingRepository;
        this.orderRepository = orderRepository;
        this.orderQuoteService = orderQuoteService;
    }

    // The caller must retain the account lock until the validated order is saved.
    @Transactional(propagation = Propagation.MANDATORY)
    public BigDecimal validateOrderRequest(OrderRequestDto request) {
        return validate(request, null);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public BigDecimal validateOrderUpdate(OrderRequestDto request, UUID orderId) {
        return validate(request, orderId);
    }

    public record Validation(BigDecimal reservedCash, QuoteResponse quote, String rejectionReason) {
        public Validation(BigDecimal reservedCash, QuoteResponse quote) { this(reservedCash,quote,null); }
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Validation validateSubmission(OrderRequestDto request) {
        var evidence = new java.util.concurrent.atomic.AtomicReference<QuoteResponse>();
        var rejection = new java.util.concurrent.atomic.AtomicReference<String>();
        BigDecimal cash = validate(request, null, evidence::set, rejection::set);
        return new Validation(cash, evidence.get(), rejection.get());
    }

    private BigDecimal validate(OrderRequestDto request, UUID excludedOrderId) {
        return validate(request, excludedOrderId, quote -> {});
    }

    private BigDecimal validate(OrderRequestDto request, UUID excludedOrderId, java.util.function.Consumer<QuoteResponse> evidence) {
        return validate(request,excludedOrderId,evidence,null);
    }

    private BigDecimal validate(OrderRequestDto request, UUID excludedOrderId, java.util.function.Consumer<QuoteResponse> evidence,
                                java.util.function.Consumer<String> rejection) {
        validateFields(request);
        Account account = accountRepository.findByIdForUpdate(request.accountId())
                .orElseThrow(() -> new OrderValidationException("Account not found"));
        if (account.isSuspended()) {
            throw new OrderValidationException("Account is suspended");
        }
        Instrument instrument = instrumentRepository.findById(request.instrumentId())
                .orElseThrow(() -> new OrderValidationException("Instrument not found"));
        if (!instrument.isActive()) {
            throw new OrderValidationException("Instrument is not tradable");
        }
        // Accounts currently have a single USD cash balance and no FX conversion.
        if (!"USD".equalsIgnoreCase(instrument.getCurrency())) {
            throw new OrderValidationException("Only USD instruments are supported");
        }

        List<Order> openOrders = orderRepository.findByAccountIdAndStatusIn(request.accountId(),
                        List.of(OrderStatus.submitted, OrderStatus.accepted))
                .stream().filter(order -> !order.getOrderId().equals(excludedOrderId)).toList();
        if (request.orderSide() == OrderSide.sell) {
            BigDecimal held = holdingRepository.findByAccountIdAndInstrumentId(request.accountId(), request.instrumentId())
                    .map(Holding::getQuantity).orElse(BigDecimal.ZERO);
            BigDecimal committed = openOrders.stream()
                    .filter(order -> order.getOrderSide() == OrderSide.sell
                            && order.getInstrumentId().equals(request.instrumentId()))
                    .map(Order::getQuantity).reduce(BigDecimal.ZERO, BigDecimal::add);
            if (held.subtract(committed).compareTo(request.quantity()) < 0) {
                throw new OrderValidationException("Insufficient available shares");
            }
            return BigDecimal.ZERO;
        }

        BigDecimal committed = openOrders.stream().filter(order -> order.getOrderSide() == OrderSide.buy)
                .map(this::reservedCash).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal required = buyingPrice(request, instrument, evidence).multiply(request.quantity())
                .setScale(2, RoundingMode.CEILING);
        if (account.getCashBalance().subtract(committed).compareTo(required) < 0) {
            if (rejection != null) {
                rejection.accept("Insufficient available cash");
                return BigDecimal.ZERO;
            }
            throw new OrderValidationException("Insufficient available cash");
        }
        return required;
    }

    private BigDecimal reservedCash(Order order) {
        if (order.getReservedCash() == null || order.getReservedCash().signum() <= 0) {
            throw new OrderValidationException("An open buy order has no cash reservation; cancel it before placing or updating buys");
        }
        return order.getReservedCash();
    }

    private BigDecimal buyingPrice(OrderRequestDto request, Instrument instrument, java.util.function.Consumer<QuoteResponse> evidence) {
        if (request.limitPrice() != null) {
            return request.limitPrice();
        }
        QuoteResponse quote = orderQuoteService.getCurrentQuoteForInstrument(request.instrumentId());
        if (quote == null
                || !instrument.getSymbol().equalsIgnoreCase(quote.symbol())
                || !instrument.getCurrency().equalsIgnoreCase(quote.currency())
                || quote.ask() == null || quote.ask().signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "A valid ask quote matching the instrument and currency is required to validate this buy order");
        }
        evidence.accept(quote);
        // Execution must recheck affordability: neither ask nor trigger guarantees a fill price.
        return request.stopPrice() == null ? quote.ask() : quote.ask().max(request.stopPrice());
    }

    private void validateFields(OrderRequestDto request) {
        if (request == null) {
            throw new OrderValidationException("Order request is required");
        }
        if (request.accountId() == null) {
            throw new OrderValidationException("Account ID is required");
        }
        if (request.instrumentId() == null) {
            throw new OrderValidationException("Instrument ID is required");
        }
        if (request.orderType() == null) {
            throw new OrderValidationException("Order type is required");
        }
        if (request.orderSide() == null) {
            throw new OrderValidationException("Order side is required");
        }
        positiveDecimal(request.quantity(), "Order quantity");
        switch (request.orderType()) {
            case market -> {
                absent(request.limitPrice(), "Limit price", "market");
                absent(request.stopPrice(), "Stop price", "market");
            }
            case limit -> {
                positiveDecimal(request.limitPrice(), "Limit price");
                absent(request.stopPrice(), "Stop price", "limit");
            }
            case stop -> {
                positiveDecimal(request.stopPrice(), "Stop price");
                absent(request.limitPrice(), "Limit price", "stop");
            }
            case stop_limit -> {
                positiveDecimal(request.limitPrice(), "Limit price");
                positiveDecimal(request.stopPrice(), "Stop price");
                int comparison = request.limitPrice().compareTo(request.stopPrice());
                if (request.orderSide() == OrderSide.buy && comparison < 0) {
                    throw new OrderValidationException("Buy stop-limit price must be greater than or equal to the stop price");
                }
                if (request.orderSide() == OrderSide.sell && comparison > 0) {
                    throw new OrderValidationException("Sell stop-limit price must be less than or equal to the stop price");
                }
            }
        }
    }

    private void positiveDecimal(BigDecimal value, String field) {
        if (value == null || value.signum() <= 0) {
            throw new OrderValidationException(field + " must be greater than 0");
        }
        if (value.compareTo(MAX_DECIMAL) > 0 || value.stripTrailingZeros().scale() > 4) {
            throw new OrderValidationException(field + " must fit 14 integer digits and at most 4 decimal places");
        }
    }

    private void absent(BigDecimal value, String field, String type) {
        if (value != null) {
            throw new OrderValidationException(field + " is not allowed for " + type + " orders");
        }
    }
}
