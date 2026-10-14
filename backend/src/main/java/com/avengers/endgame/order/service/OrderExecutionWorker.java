package com.avengers.endgame.order.service;

import com.avengers.endgame.order.domain.OrderStatus;
import com.avengers.endgame.order.repository.OrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
@ConditionalOnProperty(name = "orders.execution.enabled", havingValue = "true", matchIfMissing = true)
public class OrderExecutionWorker {
    private static final Logger log = LoggerFactory.getLogger(OrderExecutionWorker.class);
    private final OrderRepository orderRepository;
    private final OrderExecutionService executionService;

    public OrderExecutionWorker(OrderRepository orderRepository, OrderExecutionService executionService) {
        this.orderRepository = orderRepository;
        this.executionService = executionService;
    }

    // Poll persisted commitments so restarts cannot lose accepted orders.
    @Scheduled(fixedDelayString = "${orders.execution.poll-delay-ms:5000}")
    public void executeAcceptedOrders() {
        for (var order : orderRepository.findByStatusOrderByOrderDateAsc(OrderStatus.accepted)) {
            try {
                if (executionService.shouldWaitForQuote(order)) continue;
                executionService.executeOrder(order.getOrderId());
            } catch (RuntimeException exception) {
                log.warn("Execution deferred for order {}: {}", order.getOrderId(), exception.getMessage());
            }
        }
    }
}
