package com.avengers.endgame.order;

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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderControllerTest {

    @Mock
    private OrderService orderService;

    private OrderController orderController;

    @BeforeEach
    void setUp() {
        orderController = new OrderController(orderService);
    }

    @Test
    void getAllOrders_returnsOrderList() {
        UUID orderId = UUID.randomUUID();
        OrderResponseDto response = sampleResponse(orderId, OrderStatus.submitted);
        when(orderService.getAllOrders()).thenReturn(List.of(response));

        List<OrderResponseDto> result = orderController.getAllOrders();

        assertEquals(1, result.size());
        assertEquals(orderId, result.getFirst().orderId());
        assertEquals(OrderStatus.submitted, result.getFirst().status());
        verify(orderService).getAllOrders();
    }

    @Test
    void getOrderById_returnsOrder() {
        UUID orderId = UUID.randomUUID();
        OrderResponseDto response = sampleResponse(orderId, OrderStatus.accepted);
        when(orderService.getOrderById(orderId)).thenReturn(response);

        OrderResponseDto result = orderController.getOrderById(orderId);

        assertEquals(orderId, result.orderId());
        assertEquals(OrderStatus.accepted, result.status());
        verify(orderService).getOrderById(orderId);
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
        when(orderService.createOrder(request)).thenReturn(response);

        ResponseEntity<OrderResponseDto> result = orderController.createOrder(request);

        assertEquals(HttpStatus.CREATED, result.getStatusCode());
        assertNotNull(result.getBody());
        assertEquals(response.orderId(), result.getBody().orderId());
        verify(orderService).createOrder(request);
    }

    @Test
    void updatePrice_returnsUpdatedOrder() {
        UUID orderId = UUID.randomUUID();
        UpdateOrderRequest request = new UpdateOrderRequest(new BigDecimal("130.00"));
        OrderResponseDto response = sampleResponse(orderId, OrderStatus.submitted);
        when(orderService.updatePrice(orderId, request.price())).thenReturn(response);

        OrderResponseDto result = orderController.updatePrice(orderId, request);

        assertEquals(orderId, result.orderId());
        verify(orderService).updatePrice(orderId, request.price());
    }

    @Test
    void cancelOrder_returnsCancelledOrder() {
        UUID orderId = UUID.randomUUID();
        OrderResponseDto response = sampleResponse(orderId, OrderStatus.cancelled);
        when(orderService.cancelOrder(orderId)).thenReturn(response);

        OrderResponseDto result = orderController.cancelOrder(orderId);

        assertEquals(orderId, result.orderId());
        assertEquals(OrderStatus.cancelled, result.status());
        verify(orderService).cancelOrder(orderId);
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
                Instant.parse("2026-09-29T12:05:00Z")
        );
    }
}



