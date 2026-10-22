package com.avengers.endgame.account;

import java.math.*;
import java.time.Instant;
import java.util.*;

/** Replays recorded cash movements and holdings at average acquisition cost, not past market prices. */
public final class AccountHistory {
    public record Movement(Instant at, UUID instrumentId, BigDecimal cashDelta, BigDecimal holdingDelta, String type) {}
    public record Point(Instant at, BigDecimal accountValue, BigDecimal holdingsCost, BigDecimal cash, String event) {}
    public record Result(List<Point> points, boolean incomplete) {}
    public static Result calculate(BigDecimal balance, Map<UUID,BigDecimal> currentHoldings, List<Movement> movements) {
        var quantities=new HashMap<>(currentHoldings);
        BigDecimal cash=balance;
        for(var movement:movements) {
            cash=cash.subtract(movement.cashDelta());
            if(movement.instrumentId()!=null) quantities.merge(movement.instrumentId(),movement.holdingDelta().negate(),BigDecimal::add);
        }
        var costs=new HashMap<UUID,BigDecimal>();
        var unknown=new HashSet<UUID>();
        quantities.forEach((id,quantity)-> { if(quantity.signum()!=0) unknown.add(id); });
        var points=new ArrayList<Point>();boolean incomplete=!unknown.isEmpty();
        for(var movement:movements) {
            cash=cash.add(movement.cashDelta());
            var id=movement.instrumentId();var delta=movement.holdingDelta();
            if(id!=null && delta.signum()!=0) {
                var quantity=quantities.getOrDefault(id,BigDecimal.ZERO);
                var next=quantity.add(delta);
                if(delta.signum()>0 && !unknown.contains(id)) costs.merge(id,movement.cashDelta().abs(),BigDecimal::add);
                else if(delta.signum()<0 && !unknown.contains(id) && quantity.signum()>0)
                    costs.put(id,costs.getOrDefault(id,BigDecimal.ZERO).multiply(next.max(BigDecimal.ZERO)).divide(quantity,MathContext.DECIMAL128));
                if(next.signum()==0) { unknown.remove(id);costs.remove(id); }
                if(next.signum()<0) { unknown.add(id);incomplete=true; }
                quantities.put(id,next);
            }
            BigDecimal cost=unknown.isEmpty()?costs.values().stream().reduce(BigDecimal.ZERO,BigDecimal::add).setScale(2,RoundingMode.HALF_UP):null;
            points.add(new Point(movement.at(),cost==null?null:cash.add(cost).setScale(2,RoundingMode.HALF_UP),cost,cash,movement.type()));
        }
        return new Result(points,incomplete);
    }
}
