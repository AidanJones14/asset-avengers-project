package com.avengers.endgame.order.service;

import com.avengers.endgame.instrument.Instrument;
import com.avengers.endgame.instrument.InstrumentRepository;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OrderQuoteFreshnessTest {
    private final InstrumentRepository repository = mock(InstrumentRepository.class);
    private final QuoteCache cache = mock(QuoteCache.class);
    private final UUID id = UUID.randomUUID();
    private OrderQuoteService service() {
        var instrument = new Instrument(); instrument.setSymbol("AAPL");
        when(repository.findById(id)).thenReturn(Optional.of(instrument));
        return new OrderQuoteService(repository, cache);
    }

    @Test void acceptsLastClosingPriceEvenWhenProviderMarksItStale() {
        var service = service();
        for (boolean stale : new boolean[] {false, true}) {
            var quote = observation(Instant.now().minusSeconds(3 * 86400), stale, BigDecimal.TEN);
            when(cache.fresh("AAPL")).thenReturn(quote);
            assertSame(quote, service.getCurrentQuoteForInstrument(id));
        }
        verify(cache, times(2)).fresh("AAPL");
        verify(cache, never()).display(anyString());
    }

    @Test void rejectsMissingOrFutureTimestamps() {
        var service = service();
        for (Instant timestamp : new Instant[] {null, Instant.now().plusSeconds(60)}) {
            when(cache.fresh("AAPL")).thenReturn(observation(timestamp, false, BigDecimal.TEN));
            assertThrows(QuoteValidationException.class, () -> service.getCurrentQuoteForInstrument(id));
        }
        when(cache.fresh("AAPL")).thenReturn(null);
        assertThrows(QuoteValidationException.class, () -> service.getCurrentQuoteForInstrument(id));
    }

    @Test void rejectsMissingOrNonpositivePrices() {
        var service = service();
        for (BigDecimal price : new BigDecimal[] {null, BigDecimal.ZERO, BigDecimal.ONE.negate()}) {
            when(cache.fresh("AAPL")).thenReturn(observation(Instant.now(), false, price));
            assertThrows(QuoteValidationException.class, () -> service.getCurrentQuoteForInstrument(id));
        }
    }

    private QuoteResponse observation(Instant asOf, boolean stale, BigDecimal price) {
        return new QuoteResponse("AAPL", price, BigDecimal.TEN, BigDecimal.TEN,
                null, "USD", null, null, null, asOf, "CLOSED", stale, "cache");
    }
}
