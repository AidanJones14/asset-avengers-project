package com.avengers.endgame.bankaccount;

import com.avengers.endgame.order.domain.OrderSide;
import java.math.BigDecimal;
import java.math.MathContext;
import java.util.List;

/** Average-cost accounting for positions whose complete purchase history is available. */
public record PositionReturns(BigDecimal averageCost, BigDecimal realized) {
    public record Trade(OrderSide side, BigDecimal quantity, BigDecimal amount) {}
    public static PositionReturns calculate(BigDecimal currentQuantity, List<Trade> trades) {
        BigDecimal net = trades.stream().map(t -> t.side() == OrderSide.buy ? t.quantity() : t.quantity().negate())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (net.compareTo(currentQuantity) != 0) return new PositionReturns(null, BigDecimal.ZERO);
        BigDecimal quantity = BigDecimal.ZERO, basis = BigDecimal.ZERO, realized = BigDecimal.ZERO;
        for (Trade trade : trades) {
            if (trade.side() == OrderSide.buy) {
                quantity = quantity.add(trade.quantity());
                basis = basis.add(trade.amount());
            } else {
                if (quantity.compareTo(trade.quantity()) < 0) return new PositionReturns(null, BigDecimal.ZERO);
                BigDecimal soldBasis = basis.multiply(trade.quantity()).divide(quantity, MathContext.DECIMAL128);
                realized = realized.add(trade.amount().subtract(soldBasis));
                basis = basis.subtract(soldBasis);
                quantity = quantity.subtract(trade.quantity());
            }
        }
        return new PositionReturns(quantity.signum() == 0 ? BigDecimal.ZERO : basis.divide(quantity, MathContext.DECIMAL128), realized);
    }
}
