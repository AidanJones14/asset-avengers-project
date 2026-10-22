package com.avengers.endgame.order.service;

import com.avengers.endgame.order.domain.OrderSubmissionKey;
import com.avengers.endgame.order.dto.OrderRequestDto;
import com.avengers.endgame.order.dto.OrderResponseDto;
import com.avengers.endgame.order.repository.OrderSubmissionKeyRepository;
import com.avengers.endgame.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;

@Service
public class IdempotentOrderService {
    private final UserRepository users;
    private final OrderSubmissionKeyRepository keys;
    private final OrderService orders;
    private final ObjectMapper json;

    public IdempotentOrderService(UserRepository users, OrderSubmissionKeyRepository keys,
                                  OrderService orders, ObjectMapper json) {
        this.users = users; this.keys = keys; this.orders = orders; this.json = json;
    }

    @Transactional
    public OrderResponseDto create(UUID userId, UUID key, OrderRequestDto request) {
        // Serialize before taking account locks. This also handles simultaneous requests
        // with the same key but different accounts, across API instances and restarts.
        users.findByIdForUpdate(userId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        String fingerprint = fingerprint(request);
        var previous = keys.findByUserIdAndRequestKey(userId, key);
        if (previous.isPresent()) {
            if (!previous.get().getFingerprint().equals(fingerprint)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "This request key was already used for different order details. Start a new order.");
            }
            // Return the same order, with its current status; never reserve cash again.
            return orders.getOrderById(userId, previous.get().getOrderId());
        }
        OrderResponseDto result = orders.createOrder(userId, request);
        keys.save(new OrderSubmissionKey(userId, key, fingerprint, result.orderId()));
        return result;
    }

    private String fingerprint(OrderRequestDto request) {
        var canonical = new OrderRequestDto(request.accountId(), request.instrumentId(),
                request.symbol() == null ? null : request.symbol().trim().toUpperCase(Locale.ROOT),
                request.orderType(), request.orderSide(), number(request.quantity()),
                number(request.limitPrice()), number(request.stopPrice()));
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(json.writeValueAsString(canonical).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private BigDecimal number(BigDecimal value) { return value == null ? null : value.stripTrailingZeros(); }
}
