package com.avengers.endgame.order;

import com.avengers.endgame.instrument.Instrument;
import com.avengers.endgame.instrument.InstrumentService;
import com.avengers.endgame.order.domain.Order;
import com.avengers.endgame.order.domain.OrderSide;
import com.avengers.endgame.order.domain.OrderStatus;
import com.avengers.endgame.order.domain.OrderType;
import com.avengers.endgame.order.dto.OrderRequestDto;
import com.avengers.endgame.order.dto.OrderResponseDto;
import com.avengers.endgame.order.mapper.OrderMapper;
import com.avengers.endgame.order.repository.OrderRepository;
import com.avengers.endgame.order.service.OrderService;
import com.avengers.endgame.order.validator.OrderValidator;
import com.avengers.endgame.account.Account;
import com.avengers.endgame.account.AccountRepository;
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
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private OrderValidator orderValidator;

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private InstrumentService instrumentService;

    private OrderService orderService;

    // The caller. Every OrderService method is scoped to this user; "owns" stubs below say which
    // accounts belong to them.
    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        orderService = new OrderService(
                orderRepository, new OrderMapper(), orderValidator, accountRepository, instrumentService,
                mock(com.avengers.endgame.order.service.OrderAuditRecorder.class));
    }

    @Test
    void getOrders_returnsOnlyTheCallersOrders() {
        Order order = sampleOrder(OrderType.limit, OrderStatus.submitted);
        when(orderRepository.findAllOwnedBy(userId)).thenReturn(List.of(order));

        List<OrderResponseDto> responses = orderService.getOrders(userId, null);

        assertEquals(1, responses.size());
            assertEquals(order.getOrderId(), responses.getFirst().orderId());
            assertEquals(order.getAccountId(), responses.getFirst().accountId());
            assertEquals(order.getOrderType(), responses.getFirst().orderType());
    }

    @Test
    void getOrders_forOwnedAccount_returnsNewestFirstRepositoryResults() {
        UUID accountId = UUID.randomUUID();
        Order order = sampleOrder(OrderType.market, OrderStatus.submitted);
        owns(accountId);
        when(orderRepository.findByAccountIdOrderByOrderDateDesc(accountId)).thenReturn(List.of(order));

        List<OrderResponseDto> responses = orderService.getOrders(userId, accountId);

        assertEquals(1, responses.size());
        assertEquals(order.getOrderId(), responses.getFirst().orderId());
        verify(orderRepository).findByAccountIdOrderByOrderDateDesc(accountId);
    }

    @Test
    void getOrderById_returnsMappedResponse() {
        Order order = sampleOrder(OrderType.stop, OrderStatus.submitted);
        when(orderRepository.findById(order.getOrderId())).thenReturn(java.util.Optional.of(order));
        owns(order.getAccountId());

        OrderResponseDto response = orderService.getOrderById(userId, order.getOrderId());

        assertEquals(order.getOrderId(), response.orderId());
        assertEquals(order.getStatus(), response.status());
    }

    @Test
    void createOrder_setsAcceptedStatusAndTimestamp() {
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

        owns(accountId);
        when(orderValidator.validateSubmission(request)).thenReturn(new OrderValidator.Validation(new BigDecimal("1063.13"), null));
        OrderResponseDto response = orderService.createOrder(userId, request);

        ArgumentCaptor<Order> captor = ArgumentCaptor.forClass(Order.class);
        verify(orderRepository).save(captor.capture());
        Order saved = captor.getValue();

        assertEquals(accountId, saved.getAccountId());
        assertEquals(instrumentId, saved.getInstrumentId());
        assertEquals(OrderStatus.accepted, saved.getStatus());
        assertEquals(new BigDecimal("1063.13"), saved.getReservedCash());
        assertNotNull(saved.getOrderDate());
        assertEquals(request.limitPrice(), saved.getLimitPrice());
        assertEquals(saved.getStatus(), response.status());
        assertEquals(saved.getOrderDate(), response.submittedAt());
    }

    @Test
    void createOrder_resolvesInstrumentBySymbol() {
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
        UUID instrumentId = UUID.randomUUID();
        Instrument instrument = new Instrument();
        instrument.setInstrumentId(instrumentId);
        instrument.setSymbol("AAPL");
        when(instrumentService.getInstrumentBySymbol("aapl")).thenReturn(new com.avengers.endgame.instrument.InstrumentResponseDto(
                instrumentId, "AAPL", "Apple", com.avengers.endgame.instrument.SecurityType.equity, "NASDAQ", "USD", null, true));
        OrderRequestDto request = new OrderRequestDto(
                UUID.randomUUID(), null, "aapl", OrderType.market, OrderSide.buy,
                new BigDecimal("2"), null, null);
        owns(request.accountId());

        when(orderValidator.validateSubmission(any())).thenReturn(new OrderValidator.Validation(BigDecimal.ZERO, null));
        OrderResponseDto response = orderService.createOrder(userId, request);

        assertEquals(instrumentId, response.instrumentId());
        verify(instrumentService).getInstrumentBySymbol("aapl");
    }

    @Test
    void updatePrice_updatesLimitInsteadOfExecutionPrice() {
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Order order = sampleOrder(OrderType.limit, OrderStatus.submitted);
        when(orderRepository.findByIdForUpdate(order.getOrderId())).thenReturn(java.util.Optional.of(order));
        owns(order.getAccountId());

        OrderResponseDto response = orderService.updatePrice(userId, order.getOrderId(), new BigDecimal("120.00"));

        assertEquals(new BigDecimal("120.00"), response.limitPrice());
        assertEquals(new BigDecimal("100.00"), order.getPrice());
        verify(orderRepository).save(order);
    }

    @Test
    void updatePrice_rejectsMarketOrders() {
        Order order = sampleOrder(OrderType.market, OrderStatus.submitted);
        when(orderRepository.findByIdForUpdate(order.getOrderId())).thenReturn(java.util.Optional.of(order));
        owns(order.getAccountId());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> orderService.updatePrice(userId, order.getOrderId(), new BigDecimal("120.00")));

        assertEquals(400, ex.getStatusCode().value());
    }

    @Test
    void cancelOrder_cancelsSubmittedOrder() {
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Order order = sampleOrder(OrderType.limit, OrderStatus.submitted);
        when(orderRepository.findByIdForUpdate(order.getOrderId())).thenReturn(java.util.Optional.of(order));
        owns(order.getAccountId());
        when(accountRepository.findByIdForUpdate(order.getAccountId())).thenReturn(java.util.Optional.of(mock(Account.class)));

        OrderResponseDto response = orderService.cancelOrder(userId, order.getOrderId());

        assertEquals(OrderStatus.cancelled, response.status());
        assertEquals(OrderStatus.cancelled, order.getStatus());
        verify(orderRepository).save(order);
    }

    // Ownership: another client's order is a 404 with the same message as a missing one (spec),
    // and nothing is changed.
    @Test
    void anotherClientsOrder_isNotFound_forReadUpdateAndCancel() {
        Order order = sampleOrder(OrderType.limit, OrderStatus.submitted);
        when(orderRepository.findById(order.getOrderId())).thenReturn(Optional.of(order));
        when(orderRepository.findByIdForUpdate(order.getOrderId())).thenReturn(Optional.of(order));
        when(accountRepository.existsByAccountIdAndUserUserId(order.getAccountId(), userId)).thenReturn(false);
        String missing = "Order with ID " + order.getOrderId() + " not found";

        ResponseStatusException read = assertThrows(ResponseStatusException.class,
                () -> orderService.getOrderById(userId, order.getOrderId()));
        ResponseStatusException update = assertThrows(ResponseStatusException.class,
                () -> orderService.updatePrice(userId, order.getOrderId(), new BigDecimal("120.00")));
        ResponseStatusException cancel = assertThrows(ResponseStatusException.class,
                () -> orderService.cancelOrder(userId, order.getOrderId()));

        for (ResponseStatusException ex : List.of(read, update, cancel)) {
            assertEquals(404, ex.getStatusCode().value());
            assertEquals(missing, ex.getReason());
        }
        verify(orderRepository, never()).save(any(Order.class));
    }

    @Test
    void createOrder_onAnotherClientsAccount_isNotFound_andNothingIsValidatedOrSaved() {
        OrderRequestDto request = new OrderRequestDto(UUID.randomUUID(), UUID.randomUUID(),
                OrderType.market, OrderSide.buy, new BigDecimal("1"), null, null);
        when(accountRepository.existsByAccountIdAndUserUserId(request.accountId(), userId)).thenReturn(false);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> orderService.createOrder(userId, request));

        assertEquals(404, ex.getStatusCode().value());
        verify(orderValidator, never()).validateSubmission(any());
        verify(orderRepository, never()).save(any(Order.class));
    }

    @Test
    void createOrder_withoutAccountId_isBadRequest() {
        OrderRequestDto request = new OrderRequestDto(null, UUID.randomUUID(),
                OrderType.market, OrderSide.buy, new BigDecimal("1"), null, null);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> orderService.createOrder(userId, request));

        assertEquals(400, ex.getStatusCode().value());
    }

    @Test
    void getOrders_forAnotherClientsAccount_isNotFound() {
        UUID accountId = UUID.randomUUID();
        when(accountRepository.existsByAccountIdAndUserUserId(accountId, userId)).thenReturn(false);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> orderService.getOrders(userId, accountId));

        assertEquals(404, ex.getStatusCode().value());
    }

    private void owns(UUID accountId) {
        when(accountRepository.existsByAccountIdAndUserUserId(accountId, userId)).thenReturn(true);
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


