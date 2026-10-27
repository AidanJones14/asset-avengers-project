package com.avengers.endgame.order;

import com.avengers.endgame.exception.OrderValidationException;
import com.avengers.endgame.order.controller.OrderController;
import com.avengers.endgame.order.domain.OrderSide;
import com.avengers.endgame.order.domain.OrderStatus;
import com.avengers.endgame.order.domain.OrderType;
import com.avengers.endgame.order.dto.OrderRequestDto;
import com.avengers.endgame.order.dto.OrderResponseDto;
import com.avengers.endgame.order.dto.UpdateOrderRequest;
import com.avengers.endgame.order.service.OrderQuoteService;
import com.avengers.endgame.order.service.OrderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

// The controller only forwards: each test checks it passes the caller's userId (what @CurrentUserId
// resolves from the token) to OrderService, which owns the ownership checks.
@ExtendWith(MockitoExtension.class)
class OrderControllerTest {

    @Mock
    private OrderService orderService;

    @Mock
    private OrderQuoteService orderQuoteService;

    private OrderController orderController;

    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        orderController = new OrderController(orderService, orderQuoteService, org.mockito.Mockito.mock(com.avengers.endgame.order.service.IdempotentOrderService.class));
    }

    @Test
    void getOrders_returnsCallersOrders() {
        UUID orderId = UUID.randomUUID();
        OrderResponseDto response = sampleResponse(orderId, OrderStatus.submitted);
        when(orderService.getOrders(userId, null)).thenReturn(List.of(response));

        List<OrderResponseDto> result = orderController.getOrders(userId, null);

        assertEquals(1, result.size());
        assertEquals(orderId, result.getFirst().orderId());
        assertEquals(OrderStatus.submitted, result.getFirst().status());
        verify(orderService).getOrders(userId, null);
    }

    @Test
    void getOrders_filtersByAccountWhenRequested() {
        UUID accountId = UUID.randomUUID();
        OrderResponseDto response = sampleResponse(UUID.randomUUID(), OrderStatus.submitted);
        when(orderService.getOrders(userId, accountId)).thenReturn(List.of(response));

        List<OrderResponseDto> result = orderController.getOrders(userId, accountId);

        assertEquals(1, result.size());
        verify(orderService).getOrders(userId, accountId);
    }

    @Test
    void getOrderById_returnsOrder() {
        UUID orderId = UUID.randomUUID();
        OrderResponseDto response = sampleResponse(orderId, OrderStatus.submitted);
        when(orderService.getOrderById(userId, orderId)).thenReturn(response);

        OrderResponseDto result = orderController.getOrderById(userId, orderId);

        assertEquals(orderId, result.orderId());
        assertEquals(OrderStatus.submitted, result.status());
        verify(orderService).getOrderById(userId, orderId);
    }

    @Test
    void createOrder_returnsCreatedResponse() {
        OrderRequestDto request = new OrderRequestDto(
                UUID.randomUUID(),
                UUID.randomUUID(),
                OrderType.limit,
                OrderSide.buy,
                new BigDecimal("12.5"),
                new BigDecimal("101.25"),
                null
        );
        OrderResponseDto response = sampleResponse(UUID.randomUUID(), OrderStatus.submitted);
        when(orderService.createOrder(userId, request)).thenReturn(response);

        ResponseEntity<OrderResponseDto> result = orderController.createOrder(userId, request, null);

        assertEquals(HttpStatus.CREATED, result.getStatusCode());
        assertNotNull(result.getBody());
        assertEquals(response.orderId(), result.getBody().orderId());
        verify(orderService).createOrder(userId, request);
    }

    @Test
    void updatePrice_returnsUpdatedOrder() {
        UUID orderId = UUID.randomUUID();
        UpdateOrderRequest request = new UpdateOrderRequest(new BigDecimal("130.00"));
        OrderResponseDto response = sampleResponse(orderId, OrderStatus.submitted);
        when(orderService.updatePrice(userId, orderId, request.price())).thenReturn(response);

        OrderResponseDto result = orderController.updatePrice(userId, orderId, request);

        assertEquals(orderId, result.orderId());
        verify(orderService).updatePrice(userId, orderId, request.price());
    }

    @Test
    void updatePrice_routesExplicitLimitAndStopPrices() {
        UUID orderId = UUID.randomUUID();
        UpdateOrderRequest request = new UpdateOrderRequest(null, new BigDecimal("102.00"), new BigDecimal("101.00"));
        OrderResponseDto response = sampleResponse(orderId, OrderStatus.accepted);
        when(orderService.updatePrices(userId, orderId, request.limitPrice(), request.stopPrice())).thenReturn(response);

        assertEquals(orderId, orderController.updatePrice(userId, orderId, request).orderId());
        verify(orderService).updatePrices(userId, orderId, request.limitPrice(), request.stopPrice());
    }

    @Test
    void updatePrice_rejectsLegacyAndExplicitPricesTogether() {
        UUID orderId = UUID.randomUUID();
        UpdateOrderRequest request = new UpdateOrderRequest(new BigDecimal("100"), new BigDecimal("102"), null);

        assertThrows(OrderValidationException.class, () -> orderController.updatePrice(userId, orderId, request));
        verifyNoMoreInteractions(orderService);
    }

    @Test
    void cancelOrder_returnsCancelledOrder() {
        UUID orderId = UUID.randomUUID();
        OrderResponseDto response = sampleResponse(orderId, OrderStatus.cancelled);
        when(orderService.cancelOrder(userId, orderId)).thenReturn(response);

        OrderResponseDto result = orderController.cancelOrder(userId, orderId);

        assertEquals(orderId, result.orderId());
        assertEquals(OrderStatus.cancelled, result.status());
        verify(orderService).cancelOrder(userId, orderId);
    }

    private OrderResponseDto sampleResponse(UUID orderId, OrderStatus status) {
        return new OrderResponseDto(
                orderId,
                UUID.randomUUID(),
                UUID.randomUUID(),
                OrderType.limit,
                OrderSide.buy,
                new BigDecimal("10.00"),
                new BigDecimal("100.00"),
                new BigDecimal("101.00"),
                new BigDecimal("99.00"),
                status,
                Instant.parse("2026-09-29T12:00:00Z"),
                Instant.parse("2026-09-29T12:05:00Z"),
                null,
                null,
                false
        );
    }
}
