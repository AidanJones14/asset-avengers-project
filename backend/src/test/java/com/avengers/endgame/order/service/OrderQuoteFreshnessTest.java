package com.avengers.endgame.order.service;

import com.avengers.endgame.instrument.Instrument;
import com.avengers.endgame.instrument.InstrumentRepository;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OrderQuoteFreshnessTest {
    @Test
    void maximumAgeIsConfigurableAndDisplayQuotesRemainAvailable() {
        var repository = mock(InstrumentRepository.class);
        var cache = mock(QuoteCache.class);
        var id = UUID.randomUUID();
        var instrument = new Instrument(); instrument.setSymbol("AAPL");
        when(repository.findById(id)).thenReturn(Optional.of(instrument));
        var observation = new QuoteResponse("AAPL", BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN,
                null, "USD", null, null, null, Instant.now().minusSeconds(198), "OPEN", false, "test");
        when(cache.fresh("AAPL")).thenReturn(observation);
        when(cache.display("AAPL")).thenReturn(observation);
        var strict = new OrderQuoteService(repository, cache, Duration.ofSeconds(60));
        assertThrows(QuoteValidationException.class, () -> strict.getCurrentQuoteForInstrument(id));
        assertSame(observation, strict.getQuoteForInstrument(id));
        var defaultPolicy = new OrderQuoteService(repository, cache, Duration.ofMinutes(10));
        assertSame(observation, defaultPolicy.getCurrentQuoteForInstrument(id));
        assertThrows(IllegalArgumentException.class, () -> new OrderQuoteService(repository, cache, Duration.ZERO));
    }
    @Test
    void relaxedAgeLimitStillRejectsStaleOldAndFutureQuotes() {
        var repository = mock(InstrumentRepository.class);
        var cache = mock(QuoteCache.class);
        var id = UUID.randomUUID();
        var instrument = new Instrument(); instrument.setSymbol("AAPL");
        when(repository.findById(id)).thenReturn(Optional.of(instrument));
        var service = new OrderQuoteService(repository, cache, Duration.ofMinutes(10));
        for (var observation : new QuoteResponse[] {
                observation(Instant.now(), true),
                observation(Instant.now().minusSeconds(660), false),
                observation(Instant.now().plusSeconds(60), false) }) {
            when(cache.fresh("AAPL")).thenReturn(observation);
            assertThrows(QuoteValidationException.class, () -> service.getCurrentQuoteForInstrument(id));
        }
    }

    private QuoteResponse observation(Instant asOf, boolean stale) {
        return new QuoteResponse("AAPL", BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN,
                null, "USD", null, null, null, asOf, "OPEN", stale, "cache");
    }

}
