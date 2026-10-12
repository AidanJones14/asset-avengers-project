package com.avengers.endgame.order;

import com.avengers.endgame.order.domain.*;
import com.avengers.endgame.order.repository.OrderRepository;
import com.avengers.endgame.order.service.OrderExecutionService;
import com.avengers.endgame.order.service.OrderExecutionWorker;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.*;

class OrderExecutionWorkerTest {
    @Test
    void pollsPersistedAcceptedOrdersAndContinuesAfterOneExecutionFails() {
        var repository = mock(OrderRepository.class);
        var execution = mock(OrderExecutionService.class);
        var first = order();
        var second = order();
        when(repository.findByStatusOrderByOrderDateAsc(OrderStatus.accepted)).thenReturn(List.of(first, second));
        doThrow(new IllegalStateException("temporary failure")).when(execution).executeOrder(first.getOrderId());

        new OrderExecutionWorker(repository, execution).executeAcceptedOrders();

        verify(execution).executeOrder(first.getOrderId());
        verify(execution).executeOrder(second.getOrderId());
    }

    private Order order() {
        var order = new Order(UUID.randomUUID(), UUID.randomUUID(), OrderType.market, OrderSide.buy, BigDecimal.ONE, null, null);
        order.setOrderId(UUID.randomUUID());
        order.setStatus(OrderStatus.accepted);
        return order;
    }
}
