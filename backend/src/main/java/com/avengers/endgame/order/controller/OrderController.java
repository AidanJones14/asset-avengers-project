package com.avengers.endgame.order.controller;

import com.avengers.endgame.exception.OrderValidationException;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import com.avengers.endgame.order.dto.OrderRequestDto;
import com.avengers.endgame.order.dto.OrderResponseDto;
import com.avengers.endgame.order.dto.UpdateOrderRequest;
import com.avengers.endgame.order.service.OrderQuoteService;
import com.avengers.endgame.order.service.OrderService;
import com.avengers.endgame.session.CurrentUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
public class OrderController {
    private final OrderService orderService;
    private final OrderQuoteService orderQuoteService;
    private final CurrentUserService current;

    @GetMapping
    public List<OrderResponseDto> getAllOrders(@RequestParam(required = false) UUID accountId,
                                             @AuthenticationPrincipal Jwt jwt) {
        UUID owned = current.account(jwt).getAccountId();
        if (accountId != null && !owned.equals(accountId)) current.requireAccount(jwt, accountId);
        return orderService.getOrdersByAccountId(owned);
    }

    @GetMapping("/{orderId}")
    public OrderResponseDto getOrderById(@PathVariable UUID orderId, @AuthenticationPrincipal Jwt jwt) {
        var order = orderService.getOrderById(orderId);
        current.requireAccount(jwt, order.accountId());
        return order;
    }

    @PostMapping
    public ResponseEntity<OrderResponseDto> createOrder(@RequestBody OrderRequestDto request,
                                                        @AuthenticationPrincipal Jwt jwt) {
        if (request != null) current.requireAccount(jwt, request.accountId());
        return ResponseEntity.status(HttpStatus.CREATED).body(orderService.createOrder(request));
    }

    @PatchMapping("/{orderId}")
    public OrderResponseDto updatePrice(@PathVariable UUID orderId, @RequestBody UpdateOrderRequest request,
                                        @AuthenticationPrincipal Jwt jwt) {
        current.requireAccount(jwt, orderService.getOrderById(orderId).accountId());
        if (request.hasExplicitPrices()) {
            if (request.price() != null) {
                throw new OrderValidationException("Send either price or limitPrice/stopPrice, not both");
            }
            return orderService.updatePrices(orderId, request.limitPrice(), request.stopPrice());
        }
        return orderService.updatePrice(orderId, request.price());
    }

    @PatchMapping("/{orderId}/cancel")
    public OrderResponseDto cancelOrder(@PathVariable UUID orderId, @AuthenticationPrincipal Jwt jwt) {
        current.requireAccount(jwt, orderService.getOrderById(orderId).accountId());
        return orderService.cancelOrder(orderId);
    }

    @GetMapping("/quote/{instrumentId}")
    public QuoteResponse getQuoteForInstrument(@PathVariable UUID instrumentId) {
        return orderQuoteService.getQuoteForInstrument(instrumentId);
    }

    @GetMapping("/quote/symbol/{symbol}")
    public QuoteResponse getQuoteForSymbol(@PathVariable String symbol) {
        return orderQuoteService.getQuoteForSymbol(symbol);
    }
}
