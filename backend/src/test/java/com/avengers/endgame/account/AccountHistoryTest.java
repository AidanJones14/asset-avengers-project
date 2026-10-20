package com.avengers.endgame.account;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class AccountHistoryTest {
 final UUID instrument=UUID.randomUUID();
 AccountHistory.Movement m(int at,String cash,String qty,String type) { return new AccountHistory.Movement(Instant.EPOCH.plusSeconds(at),type.equals("trade")?instrument:null,new BigDecimal(cash),new BigDecimal(qty),type); }
 @Test void reconstructsPurchasesSalesAndCashMovements() {
  var r=AccountHistory.calculate(new BigDecimal("750"),Map.of(instrument,new BigDecimal("2")),List.of(m(1,"1000","0","deposit"),m(2,"-200","2","trade"),m(3,"-300","2","trade"),m(4,"350","-2","trade"),m(5,"-100","0","withdrawal")));
  assertFalse(r.incomplete());assertEquals(new BigDecimal("250.00"),r.points().getLast().holdingsCost());
  assertEquals(new BigDecimal("1000.00"),r.points().getLast().accountValue());assertEquals(new BigDecimal("750"),r.points().getLast().cash());
 }
 @Test void unknownOpeningHoldingsHaveNoInventedValuation() {
  var r=AccountHistory.calculate(new BigDecimal("100"),Map.of(instrument,new BigDecimal("2")),List.of(m(1,"100","0","deposit")));
  assertTrue(r.incomplete());assertNull(r.points().getFirst().accountValue());
 }
 @Test void preservesOpeningCashAndResetsCostAfterFullSale() {
  var r=AccountHistory.calculate(new BigDecimal("150"),Map.of(instrument,BigDecimal.ONE),List.of(m(1,"-100","1","trade"),m(2,"150","-1","trade"),m(3,"-100","1","trade")));
  assertEquals(new BigDecimal("0.00"),r.points().get(1).holdingsCost());assertEquals(new BigDecimal("250.00"),r.points().getLast().accountValue());
 }
}
