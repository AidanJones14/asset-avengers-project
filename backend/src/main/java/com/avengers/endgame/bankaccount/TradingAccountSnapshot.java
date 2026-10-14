package com.avengers.endgame.bankaccount;

import com.avengers.endgame.order.dto.OrderResponseDto;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record TradingAccountSnapshot(UUID accountId, BigDecimal cashBalance,
        BigDecimal availableCash, BigDecimal realizedReturn, List<Position> holdings, List<OrderResponseDto> orders, List<String> watchedSymbols) {
    public record Position(UUID instrumentId, String symbol, String name, BigDecimal quantity, BigDecimal averageCost, List<Purchase> purchases) {}
    public record Purchase(UUID fillId, java.time.Instant acquiredAt, BigDecimal quantity,
            BigDecimal pricePaid, BigDecimal totalCost) {}
}
