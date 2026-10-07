package com.avengers.endgame.order;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    private OrderService orderService;

    @BeforeEach
    void setUp() {
        orderService = new OrderService(orderRepository, new OrderMapper());
    }

    @Test
    void getAllOrders_returnsMappedResponses() {
        Order order = sampleOrder(OrderType.limit, OrderStatus.submitted);
        when(orderRepository.findAll()).thenReturn(List.of(order));

        List<OrderResponseDto> responses = orderService.getAllOrders();

        assertEquals(1, responses.size());
            assertEquals(order.getOrderId(), responses.getFirst().orderId());
            assertEquals(order.getAccountId(), responses.getFirst().accountId());
            assertEquals(order.getOrderType(), responses.getFirst().orderType());
    }

    @Test
    void getOrderById_returnsMappedResponse() {
        Order order = sampleOrder(OrderType.stop, OrderStatus.accepted);
        when(orderRepository.findById(order.getOrderId())).thenReturn(java.util.Optional.of(order));

        OrderResponseDto response = orderService.getOrderById(order.getOrderId());

        assertEquals(order.getOrderId(), response.orderId());
        assertEquals(order.getStatus(), response.status());
    }

    @Test
    void createOrder_setsSubmittedStatusAndTimestamp() {
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        UUID accountId = UUID.randomUUID();
        UUID instrumentId = UUID.randomUUID();
        OrderRequestDto request = new OrderRequestDto(
                accountId,
                instrumentId,
                OrderType.limit,
                OrderSide.buy,
                new BigDecimal("10.50"),
                new BigDecimal("101.25"),
                null
        );

        OrderResponseDto response = orderService.createOrder(request);

        ArgumentCaptor<Order> captor = ArgumentCaptor.forClass(Order.class);
        verify(orderRepository).save(captor.capture());
        Order saved = captor.getValue();

        assertEquals(accountId, saved.getAccountId());
        assertEquals(instrumentId, saved.getInstrumentId());
        assertEquals(OrderStatus.submitted, saved.getStatus());
        assertNotNull(saved.getOrderDate());
        assertEquals(request.limitPrice(), saved.getLimitPrice());
        assertEquals(saved.getStatus(), response.status());
        assertEquals(saved.getOrderDate(), response.submittedAt());
    }

    @Test
    void updatePrice_updatesPriceForNonMarketOrder() {
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Order order = sampleOrder(OrderType.limit, OrderStatus.submitted);
        when(orderRepository.findById(order.getOrderId())).thenReturn(java.util.Optional.of(order));

        OrderResponseDto response = orderService.updatePrice(order.getOrderId(), new BigDecimal("120.00"));

        assertEquals(new BigDecimal("120.00"), response.price());
        assertEquals(new BigDecimal("120.00"), order.getPrice());
        verify(orderRepository).save(order);
    }

    @Test
    void updatePrice_rejectsMarketOrders() {
        Order order = sampleOrder(OrderType.market, OrderStatus.submitted);
        when(orderRepository.findById(order.getOrderId())).thenReturn(java.util.Optional.of(order));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> orderService.updatePrice(order.getOrderId(), new BigDecimal("120.00")));

        assertEquals(400, ex.getStatusCode().value());
    }

    @Test
    void cancelOrder_cancelsSubmittedOrder() {
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Order order = sampleOrder(OrderType.limit, OrderStatus.submitted);
        when(orderRepository.findById(order.getOrderId())).thenReturn(java.util.Optional.of(order));

        OrderResponseDto response = orderService.cancelOrder(order.getOrderId());

        assertEquals(OrderStatus.cancelled, response.status());
        assertEquals(OrderStatus.cancelled, order.getStatus());
        verify(orderRepository).save(order);
    }

    @Test
    void cancelOrder_rejectsNonSubmittedOrder() {
        Order order = sampleOrder(OrderType.limit, OrderStatus.accepted);
        when(orderRepository.findById(order.getOrderId())).thenReturn(java.util.Optional.of(order));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> orderService.cancelOrder(order.getOrderId()));

        assertEquals(400, ex.getStatusCode().value());
    }

    private Order sampleOrder(OrderType type, OrderStatus status) {
        Order order = new Order(
                UUID.randomUUID(),
                UUID.randomUUID(),
                type,
                OrderSide.buy,
                new BigDecimal("10.00"),
                new BigDecimal("99.50"),
                new BigDecimal("95.00")
        );
        order.setOrderId(UUID.randomUUID());
        order.setPrice(new BigDecimal("100.00"));
        order.setStatus(status);
        order.setOrderDate(Instant.parse("2026-09-29T12:00:00Z"));
        order.setUpdatedAt(Instant.parse("2026-09-29T12:05:00Z"));
        return order;
    }
}



