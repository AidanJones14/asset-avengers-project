package com.avengers.endgame.order.validator;

import com.avengers.endgame.account.AccountRepository;
import com.avengers.endgame.exception.OrderValidationException;
import com.avengers.endgame.instrument.InstrumentRepository;
import com.avengers.endgame.order.domain.OrderSide;
import com.avengers.endgame.order.dto.OrderRequestDto;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component
public class OrderValidator {
    private static final BigDecimal ORDER_QUANTITY_LOWER_BOUND_EXCLUSIVE = BigDecimal.ZERO;
    private static final BigDecimal ORDER_PRICE_LOWER_BOUND_EXCLUSIVE = BigDecimal.ZERO;

    private final AccountRepository accountRepository;
    private final InstrumentRepository instrumentRepository;

    public OrderValidator(AccountRepository accountRepository, InstrumentRepository instrumentRepository) {
        this.accountRepository = accountRepository;
        this.instrumentRepository = instrumentRepository;
    }

    public void validateOrderRequest(OrderRequestDto orderRequest) {
        if (orderRequest.accountId() == null) {
            throw new OrderValidationException("Account ID is required");
        }
        else if (orderRequest.instrumentId() == null) {
            throw new OrderValidationException("Instrument ID is required");
        }
        else if (orderRequest.orderType() == null) {
            throw new OrderValidationException("Order type is required");
        }
        else if (orderRequest.orderSide() == null) {
            throw new OrderValidationException("Order side is required");
        }
        else if (accountRepository.findById(orderRequest.accountId()).isEmpty()) {
            throw new OrderValidationException("Account not found");
        }
        else if (orderRequest.quantity() == null || orderRequest.quantity().compareTo(ORDER_QUANTITY_LOWER_BOUND_EXCLUSIVE) <= 0) {
            throw new OrderValidationException("Order quantity must be greater than 0");
        }
        else if (instrumentRepository.findById(orderRequest.instrumentId()).isEmpty()) {
            throw new OrderValidationException("Instrument not found");
        }
        else if (!checkValidOrderType(orderRequest)) {
            throw new OrderValidationException("Invalid order type");
        }
    }

    private boolean checkValidOrderType(OrderRequestDto orderRequest) {
        return switch (orderRequest.orderType()) {
            case market -> isMarketOrderValid(orderRequest);
            case limit -> isLimitOrderValid(orderRequest);
            case stop -> isStopOrderValid(orderRequest);
            case stop_limit -> isStopLimitOrderValid(orderRequest);
        };
    }

    private boolean isMarketOrderValid(OrderRequestDto orderRequest) {
        return orderRequest.limitPrice() == null && orderRequest.stopPrice() == null;
    }

    private boolean isLimitOrderValid(OrderRequestDto orderRequest) {
        return isPositive(orderRequest.limitPrice()) && orderRequest.stopPrice() == null;
    }

    private boolean isStopOrderValid(OrderRequestDto orderRequest) {
        return isPositive(orderRequest.stopPrice()) && orderRequest.limitPrice() == null;
    }

    private boolean isStopLimitOrderValid(OrderRequestDto orderRequest) {
        if (!isPositive(orderRequest.limitPrice()) || !isPositive(orderRequest.stopPrice())) {
            return false;
        }

        if (orderRequest.orderSide() == OrderSide.buy) {
            return orderRequest.limitPrice().compareTo(orderRequest.stopPrice()) >= 0;
        }

        return orderRequest.limitPrice().compareTo(orderRequest.stopPrice()) <= 0;
    }

    private boolean isPositive(BigDecimal value) {
        return value != null && value.compareTo(ORDER_PRICE_LOWER_BOUND_EXCLUSIVE) > 0;
    }
}
