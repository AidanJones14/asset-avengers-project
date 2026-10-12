package com.avengers.endgame.order;

import com.avengers.endgame.account.*;
import com.avengers.endgame.exception.OrderValidationException;
import com.avengers.endgame.holding.*;
import com.avengers.endgame.instrument.*;
import com.avengers.endgame.order.domain.*;
import com.avengers.endgame.order.dto.OrderRequestDto;
import com.avengers.endgame.order.repository.OrderRepository;
import com.avengers.endgame.order.service.OrderQuoteService;
import com.avengers.endgame.order.validator.OrderValidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OrderValidatorTest {
    private static final UUID ACCOUNT = UUID.randomUUID();
    private static final UUID INSTRUMENT = UUID.randomUUID();
    @Mock AccountRepository accounts;
    @Mock InstrumentRepository instruments;
    @Mock HoldingRepository holdings;
    @Mock OrderRepository orders;
    @Mock OrderQuoteService quotes;
    private OrderValidator validator;

    @BeforeEach
    void setUp() {
        validator = new OrderValidator(accounts, instruments, holdings, orders, quotes);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"0", "-1", "0.00001", "100000000000000"})
    void rejectsInvalidQuantityBeforeDatabaseAccess(String quantity) {
        var request = request(OrderType.limit, OrderSide.buy, decimal(quantity), decimal("50"), null);
        assertThrows(OrderValidationException.class, () -> validator.validateOrderRequest(request));
        verifyNoInteractions(accounts, instruments, holdings, orders, quotes);
    }

    @ParameterizedTest
    @MethodSource("missingFields")
    void rejectsMissingRequiredFields(OrderRequestDto request, String message) {
        var error = assertThrows(OrderValidationException.class, () -> validator.validateOrderRequest(request));
        assertEquals(message, error.getMessage());
        verifyNoInteractions(accounts, instruments, holdings, orders, quotes);
    }

    static Stream<Arguments> missingFields() {
        return Stream.of(
                Arguments.of(null, "Order request is required"),
                Arguments.of(new OrderRequestDto(null, INSTRUMENT, OrderType.market, OrderSide.buy, BigDecimal.ONE, null, null), "Account ID is required"),
                Arguments.of(new OrderRequestDto(ACCOUNT, null, OrderType.market, OrderSide.buy, BigDecimal.ONE, null, null), "Instrument ID is required"),
                Arguments.of(request(null, OrderSide.buy, BigDecimal.ONE, null, null), "Order type is required"),
                Arguments.of(request(OrderType.market, null, BigDecimal.ONE, null, null), "Order side is required"));
    }

    @ParameterizedTest
    @CsvSource({
            "market,buy,50,", "market,sell,,50", "limit,buy,,", "limit,sell,0,",
            "limit,buy,-1,", "limit,buy,50,49", "stop,buy,,", "stop,sell,,0",
            "stop,buy,50,49", "stop_limit,buy,,50", "stop_limit,sell,50,",
            "stop_limit,buy,49,50", "stop_limit,sell,51,50", "limit,buy,0.00001,",
            "limit,buy,100000000000000,", "stop,buy,,0.00001"
    })
    void rejectsIncompatiblePrices(OrderType type, OrderSide side, String limit, String stop) {
        var request = request(type, side, BigDecimal.ONE, decimal(limit), decimal(stop));
        assertThrows(OrderValidationException.class, () -> validator.validateOrderRequest(request));
        verifyNoInteractions(accounts, instruments, holdings, orders, quotes);
    }

    @ParameterizedTest
    @CsvSource({"limit,buy,50,", "limit,sell,50,", "stop_limit,buy,50,50",
            "stop_limit,buy,51,50", "stop_limit,sell,50,50", "stop_limit,sell,49,50"})
    void acceptsValidLimitRulesIncludingEqualStopAndLimit(OrderType type, OrderSide side, String limit, String stop) {
        eligibleAccount("1000");
        if (side == OrderSide.sell) {
            when(holdings.findByAccountIdAndInstrumentId(ACCOUNT, INSTRUMENT))
                    .thenReturn(Optional.of(new Holding(ACCOUNT, INSTRUMENT, new BigDecimal("20"))));
        }
        assertDoesNotThrow(() -> validator.validateOrderRequest(request(type, side, BigDecimal.ONE, decimal(limit), decimal(stop))));
        verifyNoInteractions(quotes);
    }

    @Test
    void acceptsFractionalQuantityAndRoundsReservationUpToCents() {
        eligibleAccount("1");
        assertEquals(new BigDecimal("0.34"), validator.validateOrderRequest(
                request(OrderType.limit, OrderSide.buy, decimal("0.3333"), decimal("1.00000"), null)));
    }

    @Test
    void rejectsUnknownAccount() {
        var error = assertThrows(OrderValidationException.class,
                () -> validator.validateOrderRequest(request(OrderType.market, OrderSide.buy, BigDecimal.ONE, null, null)));
        assertEquals("Account not found", error.getMessage());
    }

    @Test
    void rejectsSuspendedAccount() {
        Account account = new Account(null, decimal("1000"));
        account.setSuspended(true);
        when(accounts.findByIdForUpdate(ACCOUNT)).thenReturn(Optional.of(account));
        var error = assertThrows(OrderValidationException.class,
                () -> validator.validateOrderRequest(request(OrderType.market, OrderSide.buy, BigDecimal.ONE, null, null)));
        assertEquals("Account is suspended", error.getMessage());
        verifyNoInteractions(instruments, orders, quotes);
    }

    @Test
    void rejectsInactiveInstrument() {
        Instrument instrument = eligibleAccount("1000");
        instrument.setActive(false);
        var error = assertThrows(OrderValidationException.class,
                () -> validator.validateOrderRequest(request(OrderType.market, OrderSide.buy, BigDecimal.ONE, null, null)));
        assertEquals("Instrument is not tradable", error.getMessage());
    }

    @Test
    void rejectsUnsupportedCurrencyInsteadOfTreatingItAsDollars() {
        Instrument instrument = eligibleAccount("1000");
        instrument.setCurrency("GBP");
        assertThrows(OrderValidationException.class,
                () -> validator.validateOrderRequest(request(OrderType.limit, OrderSide.buy, BigDecimal.ONE, decimal("50"), null)));
    }

    private Instrument eligibleAccount(String balance) {
        when(accounts.findByIdForUpdate(ACCOUNT)).thenReturn(Optional.of(new Account(null, decimal(balance))));
        Instrument instrument = new Instrument();
        instrument.setInstrumentId(INSTRUMENT);
        instrument.setSymbol("AAPL");
        when(instruments.findById(INSTRUMENT)).thenReturn(Optional.of(instrument));
        return instrument;
    }

    private static OrderRequestDto request(OrderType type, OrderSide side, BigDecimal quantity, BigDecimal limit, BigDecimal stop) {
        return new OrderRequestDto(ACCOUNT, INSTRUMENT, type, side, quantity, limit, stop);
    }

    private static BigDecimal decimal(String value) {
        return value == null ? null : new BigDecimal(value);
    }
}
