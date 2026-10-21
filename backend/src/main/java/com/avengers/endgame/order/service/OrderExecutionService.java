package com.avengers.endgame.order.service;

import com.avengers.endgame.account.Account;
import com.avengers.endgame.account.AccountRepository;
import com.avengers.endgame.holding.Holding;
import com.avengers.endgame.holding.HoldingRepository;
import com.avengers.endgame.instrument.Instrument;
import com.avengers.endgame.instrument.InstrumentRepository;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import com.avengers.endgame.order.domain.*;
import com.avengers.endgame.order.repository.OrderRepository;
import com.avengers.endgame.order.repository.TradeFillRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Owns settlement: one locked transaction changes cash, shares, fill and order status. */
@Service
public class OrderExecutionService {
    private static final BigDecimal MAX_CASH = new BigDecimal("9999999999999999.99");
    private static final BigDecimal MAX_QUANTITY = new BigDecimal("99999999999999.9999");
    private final OrderRepository orderRepository;
    private final AccountRepository accountRepository;
    private final HoldingRepository holdingRepository;
    private final InstrumentRepository instrumentRepository;
    private final TradeFillRepository fillRepository;
    private final OrderQuoteService quoteService;
    private final OrderAuditRecorder audit;

    public OrderExecutionService(OrderRepository orderRepository, AccountRepository accountRepository,
                                 HoldingRepository holdingRepository, InstrumentRepository instrumentRepository,
                                 TradeFillRepository fillRepository, OrderQuoteService quoteService, OrderAuditRecorder audit) {
        this.orderRepository = orderRepository;
        this.accountRepository = accountRepository;
        this.holdingRepository = holdingRepository;
        this.instrumentRepository = instrumentRepository;
        this.fillRepository = fillRepository;
        this.quoteService = quoteService;
        this.audit = audit;
    }

    // Cached monitoring avoids a paid fresh request on every worker poll for waiting limits/stops.
    // Once a price may execute, executeOrder obtains a fresh quote and rechecks all conditions.
    public boolean shouldWaitForQuote(Order order) {
        if (order.getOrderType() == OrderType.market) return false;
        QuoteResponse quote = quoteService.getQuoteForInstrument(order.getInstrumentId());
        BigDecimal price = order.getOrderSide() == OrderSide.buy ? quote.ask() : quote.bid();
        if (price == null || price.signum() <= 0) return false;
        boolean buy = order.getOrderSide() == OrderSide.buy;
        if ((order.getOrderType() == OrderType.stop || order.getOrderType() == OrderType.stop_limit)
                && !order.isStopTriggered()) {
            return buy ? price.compareTo(order.getStopPrice()) < 0 : price.compareTo(order.getStopPrice()) > 0;
        }
        if (order.getOrderType() == OrderType.limit || order.getOrderType() == OrderType.stop_limit)
            return buy ? price.compareTo(order.getLimitPrice()) > 0 : price.compareTo(order.getLimitPrice()) < 0;
        return false;
    }

    @Transactional
    public void executeOrder(UUID orderId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found"));
        if (order.getStatus() != OrderStatus.accepted) {
            return; // Retrying a completed order never produces a duplicate fill.
        }
        Account account = accountRepository.findByIdForUpdate(order.getAccountId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found"));
        Instrument instrument = instrumentRepository.findById(order.getInstrumentId()).orElse(null);
        if (account.isSuspended() || account.isDeactivated() || instrument == null || !instrument.isActive()) {
            reject(order, "Account or instrument is no longer eligible to trade");
            return;
        }
        if (!"USD".equalsIgnoreCase(instrument.getCurrency())) {
            reject(order, "Only USD instruments are supported by the current cash ledger");
            return;
        }

        // Fetch again at execution; never fill at the submission estimate or limit price.
        QuoteResponse quote;
        try {
            quote = quoteService.getCurrentQuoteForInstrument(order.getInstrumentId());
        } catch (QuoteValidationException invalid) {
            audit.rejected(orderId, invalid.quote(), invalid.getReason());
            throw invalid;
        }
        BigDecimal rawPrice = order.getOrderSide() == OrderSide.buy ? quote.ask() : quote.bid();
        if (!instrument.getSymbol().equalsIgnoreCase(quote.symbol())
                || !instrument.getCurrency().equalsIgnoreCase(quote.currency())
                || rawPrice == null || rawPrice.signum() <= 0 || rawPrice.compareTo(MAX_QUANTITY) > 0) {
            audit.rejected(orderId, quote, "Quote does not contain a valid execution price");
            throw new QuoteValidationException("Quote does not contain a valid execution price", quote);
        }
        audit.observed(orderId, "execution", quote);
        boolean buy = order.getOrderSide() == OrderSide.buy;
        BigDecimal price = rawPrice.setScale(4, buy ? RoundingMode.CEILING : RoundingMode.FLOOR);
        if (price.signum() == 0) {
            reject(order, "Market price is below supported price precision");
            return;
        }
        if (!isExecutable(order, price)) {
            return;
        }
        // Record this exact settled amount on the fill. Reporting and cost basis
        // must use it directly rather than multiply again with different rounding.
        BigDecimal amount = price.multiply(order.getQuantity())
                .setScale(2, buy ? RoundingMode.CEILING : RoundingMode.FLOOR);
        if (amount.signum() == 0) {
            reject(order, "Trade value is below one cent");
            return;
        }
        List<Order> otherOrders = orderRepository.findByAccountIdAndStatusIn(account.getAccountId(),
                        List.of(OrderStatus.submitted, OrderStatus.accepted)).stream()
                .filter(other -> !other.getOrderId().equals(orderId)).toList();
        Holding holding = holdingRepository.findByAccountIdAndInstrumentId(order.getAccountId(), order.getInstrumentId())
                .orElseGet(() -> new Holding(order.getAccountId(), order.getInstrumentId(), BigDecimal.ZERO));
        if (buy) {
            BigDecimal committed = BigDecimal.ZERO;
            for (Order other : otherOrders) {
                if (other.getOrderSide() == OrderSide.buy) {
                    if (other.getReservedCash() == null || other.getReservedCash().signum() <= 0) {
                        reject(order, "Another open buy order has no known cash reservation");
                        return;
                    }
                    committed = committed.add(other.getReservedCash());
                }
            }
            if (account.getCashBalance().subtract(committed).compareTo(amount) < 0) {
                reject(order, "Insufficient available cash at execution price");
                return;
            }
            if (holding.getQuantity().add(order.getQuantity()).compareTo(MAX_QUANTITY) > 0) {
                reject(order, "Resulting holding exceeds supported quantity");
                return;
            }
            account.setCashBalance(account.getCashBalance().subtract(amount));
            holding.setQuantity(holding.getQuantity().add(order.getQuantity()));
        } else {
            BigDecimal committed = otherOrders.stream()
                    .filter(other -> other.getOrderSide() == OrderSide.sell
                            && other.getInstrumentId().equals(order.getInstrumentId()))
                    .map(Order::getQuantity).reduce(BigDecimal.ZERO, BigDecimal::add);
            if (holding.getQuantity().subtract(committed).compareTo(order.getQuantity()) < 0) {
                reject(order, "Insufficient available shares at execution");
                return;
            }
            if (account.getCashBalance().add(amount).compareTo(MAX_CASH) > 0) {
                reject(order, "Resulting cash balance exceeds supported amount");
                return;
            }
            account.setCashBalance(account.getCashBalance().add(amount));
            holding.setQuantity(holding.getQuantity().subtract(order.getQuantity()));
        }

        Instant now = Instant.now();
        account.setUpdatedAt(now);
        holding.setUpdatedAt(now);
        accountRepository.save(account);
        holdingRepository.save(holding);
        // The fill trigger creates the signed cash movement; lifecycle/status
        // triggers queue audit envelopes. None of these writes contacts Kafka.
        fillRepository.save(new TradeFill(order, price, amount, now));
        order.setPrice(price);
        order.setStatus(OrderStatus.filled);
        order.setReservedCash(BigDecimal.ZERO);
        order.setDateFinalized(now);
        order.setUpdatedAt(now);
        orderRepository.save(order);
    }

    private boolean isExecutable(Order order, BigDecimal price) {
        boolean buy = order.getOrderSide() == OrderSide.buy;
        if ((order.getOrderType() == OrderType.stop || order.getOrderType() == OrderType.stop_limit)
                && !order.isStopTriggered()) {
            boolean triggered = buy ? price.compareTo(order.getStopPrice()) >= 0 : price.compareTo(order.getStopPrice()) <= 0;
            if (!triggered) {
                return false;
            }
            order.setStopTriggered(true);
            order.setUpdatedAt(Instant.now());
        }
        if (order.getOrderType() == OrderType.limit || order.getOrderType() == OrderType.stop_limit) {
            return buy ? price.compareTo(order.getLimitPrice()) <= 0 : price.compareTo(order.getLimitPrice()) >= 0;
        }
        return true;
    }

    private void reject(Order order, String reason) {
        order.setStatus(OrderStatus.rejected);
        order.setRejectionReason(reason);
        order.setReservedCash(BigDecimal.ZERO);
        order.setDateFinalized(Instant.now());
        order.setUpdatedAt(Instant.now());
        orderRepository.save(order);
    }
}
