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
    private final OrderQuoteService orderQuoteService;

    public OrderController(OrderService orderService, OrderQuoteService orderQuoteService) {
        this.orderService = orderService;
        this.orderQuoteService = orderQuoteService;
    }

    @GetMapping
    public List<OrderResponseDto> getAllOrders() {
        return orderService.getAllOrders();
    }

    @GetMapping("/{orderId}")
    public OrderResponseDto getOrderById(@PathVariable UUID orderId) {
        return orderService.getOrderById(orderId);
    }

    @GetMapping("/quote/{instrumentId}")
    public QuoteResponse getQuoteForInstrument(@PathVariable UUID instrumentId) {
        return orderQuoteService.getQuoteForInstrument(instrumentId);
    }

    @PostMapping
    public ResponseEntity<OrderResponseDto> createOrder(@RequestBody OrderRequestDto request) {
        OrderResponseDto response = orderService.createOrder(request);

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PatchMapping("/{orderId}")
    public OrderResponseDto updatePrice(@PathVariable UUID orderId, @RequestBody UpdateOrderRequest request) {
        return orderService.updatePrice(orderId, request.price());
    }

    @PatchMapping("/{orderId}/cancel")
    public OrderResponseDto cancelOrder(@PathVariable UUID orderId) {
        return orderService.cancelOrder(orderId);
    }
}
