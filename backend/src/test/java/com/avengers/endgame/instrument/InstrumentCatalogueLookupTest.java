package com.avengers.endgame.instrument;

import com.avengers.endgame.order.service.QuoteCache;
import org.junit.jupiter.api.Test;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class InstrumentCatalogueLookupTest {
    @Test
    void savedCryptoLookupUsesCanonicalSymbolAndNonUsdInstrumentsAreRejected() {
        var repository = mock(InstrumentRepository.class);
        var mapper = mock(InstrumentMapper.class);
        var quotes = mock(QuoteCache.class);
        var service = new InstrumentService(repository, mapper, quotes);
        for (String symbol : new String[]{"X:BTC-USD"}) {
            var instrument = new Instrument();
            instrument.setSymbol(symbol);
            when(repository.findBySymbol(symbol)).thenReturn(Optional.of(instrument));
            service.getInstrumentBySymbol(symbol.toLowerCase(java.util.Locale.ROOT));
            verify(mapper).toResponse(instrument);
        }
        var foreign = new Instrument(); foreign.setSymbol("FOREIGN"); foreign.setCurrency("EUR");
        when(repository.findBySymbol("FOREIGN")).thenReturn(Optional.of(foreign));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> service.getInstrumentBySymbol("FOREIGN"));
        verifyNoInteractions(quotes);
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> service.getInstrumentBySymbol("X:BTC/USD"));
    }
}
