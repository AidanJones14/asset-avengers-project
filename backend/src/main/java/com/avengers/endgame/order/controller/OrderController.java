package com.avengers.endgame.order.controller;

import com.avengers.endgame.exception.OrderValidationException;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import com.avengers.endgame.order.dto.OrderRequestDto;
import com.avengers.endgame.order.dto.OrderResponseDto;
import com.avengers.endgame.order.service.OrderQuoteService;
import com.avengers.endgame.order.service.OrderService;
import com.avengers.endgame.order.dto.UpdateOrderRequest;
import com.avengers.endgame.security.CurrentUserId;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

// Owner: order domain (web layer). A client's orders and the quotes used to price them, under /api/v1/orders.
// Before any method here runs:
//   - SecurityConfig lets any signed-in role use /api/v1/orders/quote/**, and only CLIENT tokens
//     use the rest of /api/v1/orders/** (anyone else gets 403)
//   - UserProvisioningInterceptor has made sure the caller's users row and trading account exist
// This class holds no security or ownership logic: each order endpoint passes the caller's id
//   (@CurrentUserId, from the token) to OrderService, which only touches that user's orders.
@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {
    private final OrderService orderService;
    private final OrderQuoteService orderQuoteService;

    // Constructor injection: Spring passes in the two service beans.
    public OrderController(OrderService orderService, OrderQuoteService orderQuoteService) {
        this.orderService = orderService;
        this.orderQuoteService = orderQuoteService;
    }

    // GET /api/v1/orders/quote/{instrumentId}: an indicative quote. Any signed-in role; not user data.
    @GetMapping("/quote/{instrumentId}")
    public QuoteResponse getQuoteForInstrument(@PathVariable UUID instrumentId) {
        return orderQuoteService.getQuoteForInstrument(instrumentId);
    }

    // GET /api/v1/orders/quote/symbol/{symbol}: the same, looked up by ticker.
    @GetMapping("/quote/symbol/{symbol}")
    public QuoteResponse getQuoteForSymbol(@PathVariable String symbol) {
        return orderQuoteService.getQuoteForSymbol(symbol);
    }

    // GET /api/v1/orders[?accountId=...]: the caller's orders, newest first.
    // An accountId that isn't the caller's gives 404.
    @GetMapping
    public List<OrderResponseDto> getOrders(@CurrentUserId UUID userId,
                                            @RequestParam(required = false) UUID accountId) {
        return orderService.getOrders(userId, accountId);
    }

    // POST /api/v1/orders: place an order. 201 with the accepted order.
    // The body's accountId must be the caller's (400 if missing, 404 if not theirs).
    @PostMapping
    public ResponseEntity<OrderResponseDto> createOrder(@CurrentUserId UUID userId,
                                                        @RequestBody OrderRequestDto request) {
        OrderResponseDto response = orderService.createOrder(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // GET /api/v1/orders/{orderId}: one of the caller's orders. Someone else's gives 404.
    @GetMapping("/{orderId}")
    public OrderResponseDto getOrderById(@CurrentUserId UUID userId, @PathVariable UUID orderId) {
        return orderService.getOrderById(userId, orderId);
    }

    // PATCH /api/v1/orders/{orderId}: change the limit/stop price of one of the caller's open orders.
    // Send either {price} or {limitPrice, stopPrice}, not both.
    @PatchMapping("/{orderId}")
    public OrderResponseDto updatePrice(@CurrentUserId UUID userId, @PathVariable UUID orderId,
                                        @RequestBody UpdateOrderRequest request) {
        if (request.hasExplicitPrices()) {
            if (request.price() != null) {
                throw new OrderValidationException("Send either price or limitPrice/stopPrice, not both");
            }
            return orderService.updatePrices(userId, orderId, request.limitPrice(), request.stopPrice());
        }
        return orderService.updatePrice(userId, orderId, request.price());
    }

    // PATCH /api/v1/orders/{orderId}/cancel: cancel one of the caller's open orders.
    @PatchMapping("/{orderId}/cancel")
    public OrderResponseDto cancelOrder(@CurrentUserId UUID userId, @PathVariable UUID orderId) {
        return orderService.cancelOrder(userId, orderId);
    }
}
