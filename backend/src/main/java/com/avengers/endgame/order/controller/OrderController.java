package com.avengers.endgame.order.controller;

import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import com.avengers.endgame.order.dto.OrderRequestDto;
import com.avengers.endgame.order.dto.OrderResponseDto;
import com.avengers.endgame.order.service.OrderQuoteService;
import com.avengers.endgame.order.service.OrderService;
import com.avengers.endgame.order.dto.UpdateOrderRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {
    private final OrderService orderService;
    private com.avengers.endgame.session.CurrentUserService current;
    private final OrderQuoteService orderQuoteService;

    public OrderController(OrderService orderService, OrderQuoteService orderQuoteService) {
        this.orderService = orderService;
        this.orderQuoteService = orderQuoteService;
    }

    @org.springframework.beans.factory.annotation.Autowired
    public OrderController(OrderService orders, OrderQuoteService quotes, com.avengers.endgame.session.CurrentUserService current) {
        this(orders, quotes); this.current = current;
    }

    public List<OrderResponseDto> getAllOrders(@RequestParam(required = false) UUID accountId) {
        return accountId == null ? orderService.getAllOrders() : orderService.getOrdersByAccountId(accountId);
    }

    public OrderResponseDto getOrderById(@PathVariable UUID orderId) {
        return orderService.getOrderById(orderId);
    }

    @GetMapping("/quote/{instrumentId}")
    public QuoteResponse getQuoteForInstrument(@PathVariable UUID instrumentId) {
        return orderQuoteService.getQuoteForInstrument(instrumentId);
    }

    public ResponseEntity<OrderResponseDto> createOrder(@RequestBody OrderRequestDto request) {
        OrderResponseDto response = orderService.createOrder(request);

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    public OrderResponseDto updatePrice(@PathVariable UUID orderId, @RequestBody UpdateOrderRequest request) {
        return orderService.updatePrice(orderId, request.price());
    }

    public OrderResponseDto cancelOrder(@PathVariable UUID orderId) {
        return orderService.cancelOrder(orderId);
    }
    @GetMapping("/quote/symbol/{symbol}")
    public QuoteResponse getQuoteForSymbol(@PathVariable String symbol) {
        return orderQuoteService.getQuoteForSymbol(symbol);
    }
    @GetMapping
    public List<OrderResponseDto> listOwned(@RequestParam(required = false) UUID accountId,
            @org.springframework.security.core.annotation.AuthenticationPrincipal org.springframework.security.oauth2.jwt.Jwt jwt) {
        UUID owned = current.account(jwt).getAccountId();
        if (accountId != null) current.requireAccount(jwt, accountId);
        return getAllOrders(owned);
    }
    @PostMapping
    public ResponseEntity<OrderResponseDto> createOwned(@RequestBody OrderRequestDto request,
            @org.springframework.security.core.annotation.AuthenticationPrincipal org.springframework.security.oauth2.jwt.Jwt jwt) {
        if (request != null) current.requireAccount(jwt, request.accountId());
        return createOrder(request);
    }
    @GetMapping("/{orderId}")
    public OrderResponseDto readOwned(@PathVariable UUID orderId,
            @org.springframework.security.core.annotation.AuthenticationPrincipal org.springframework.security.oauth2.jwt.Jwt jwt) {
        var order = getOrderById(orderId); current.requireAccount(jwt, order.accountId()); return order;
    }
    @PatchMapping("/{orderId}")
    public OrderResponseDto updateOwned(@PathVariable UUID orderId, @RequestBody UpdateOrderRequest request,
            @org.springframework.security.core.annotation.AuthenticationPrincipal org.springframework.security.oauth2.jwt.Jwt jwt) {
        current.requireAccount(jwt, getOrderById(orderId).accountId()); return updatePrice(orderId, request);
    }
    @PatchMapping("/{orderId}/cancel")
    public OrderResponseDto cancelOwned(@PathVariable UUID orderId,
            @org.springframework.security.core.annotation.AuthenticationPrincipal org.springframework.security.oauth2.jwt.Jwt jwt) {
        current.requireAccount(jwt, getOrderById(orderId).accountId()); return cancelOrder(orderId);
    }
}
