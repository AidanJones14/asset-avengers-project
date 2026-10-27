package com.avengers.endgame.order;

import com.avengers.endgame.bankaccount.PositionReturns;
import com.avengers.endgame.order.domain.OrderSide;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class PositionReturnsTest {
    private static PositionReturns.Trade trade(OrderSide side, String quantity, String amount) {
        return new PositionReturns.Trade(side, new BigDecimal(quantity), new BigDecimal(amount));
    }
    @Test void averagesBuysAndRealizesOnlyTheSoldCostBasis() {
        var result = PositionReturns.calculate(new BigDecimal("2"), List.of(
            trade(OrderSide.buy, "2", "100"), trade(OrderSide.buy, "2", "140"),
            trade(OrderSide.sell, "2", "150")));
        assertEquals(0, new BigDecimal("60").compareTo(result.averageCost()));
        assertEquals(0, new BigDecimal("30").compareTo(result.realized()));
    }
    @Test void retainsRealizedProfitWhenPositionIsClosed() {
        var result = PositionReturns.calculate(BigDecimal.ZERO, List.of(
            trade(OrderSide.buy, "1", "100.01"), trade(OrderSide.sell, "1", "110.00")));
        assertEquals(0, BigDecimal.ZERO.compareTo(result.averageCost()));
        assertEquals(0, new BigDecimal("9.99").compareTo(result.realized()));
    }
    @Test void doesNotInventBasisForSeededSharesWithoutPurchaseHistory() {
        var result = PositionReturns.calculate(new BigDecimal("3.5"), List.of());
        assertNull(result.averageCost());
        assertEquals(BigDecimal.ZERO, result.realized());
    }
}
