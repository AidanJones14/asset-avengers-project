package com.avengers.endgame.order;
import com.avengers.endgame.order.service.QuoteCache;
import com.avengers.endgame.integration.pricing.client.PricingApiClient;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.math.BigDecimal;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
class QuoteCacheTest {
 @Test void displayRequestsReuseOneQuoteButOrdersAlwaysFetchAgain() {
    var pricing = mock(PricingApiClient.class);
    var clock = mock(Clock.class);
    Instant now = Instant.parse("2026-10-14T12:00:00Z");
    when(clock.instant()).thenReturn(now);
    var quote = new QuoteResponse("AAPL", BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN, null,
        "USD", null, null, null, now, "OPEN", false, "test");
    when(pricing.getQuote("AAPL")).thenReturn(quote);
    var cache = new QuoteCache(pricing, Duration.ofMinutes(1), clock);
    assertSame(quote, cache.display("aapl"));
    assertSame(quote, cache.display("AAPL"));
    verify(pricing, times(1)).getQuote("AAPL");
    cache.fresh("AAPL");
    verify(pricing, times(2)).getQuote("AAPL");
    when(clock.instant()).thenReturn(now.plusSeconds(61));
    cache.display("AAPL");
    verify(pricing, times(3)).getQuote("AAPL");
 }
 @Test void markStorageFailureDoesNotBreakQuoteOrTriggerExtraProviderCalls() {
    var pricing = mock(PricingApiClient.class);
    var events = mock(org.springframework.context.ApplicationEventPublisher.class);
    var quote = new QuoteResponse("AAPL", BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN, null,
        "USD", null, null, null, Instant.now(), "OPEN", false, "test");
    when(pricing.getQuote("AAPL")).thenReturn(quote);
    doThrow(new IllegalStateException("test failure")).when(events).publishEvent(quote);
    var cache = new QuoteCache(pricing, Duration.ofMinutes(1), events);
    assertSame(quote,cache.display("AAPL"));
    assertSame(quote,cache.display("AAPL"));
    verify(pricing,times(1)).getQuote("AAPL");
    verify(events,times(1)).publishEvent(quote);
 }
 // Order freeze: a provider call stuck on one symbol must not make every other quote wait behind it.
 @Test void aSlowProviderCallDoesNotBlockOtherSymbols() throws Exception {
    var pricing = mock(PricingApiClient.class);
    var entered = new java.util.concurrent.CountDownLatch(1);
    var release = new java.util.concurrent.CountDownLatch(1);
    var aapl = new QuoteResponse("AAPL", BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN, null,
        "USD", null, null, null, Instant.now(), "OPEN", false, "test");
    var msft = new QuoteResponse("MSFT", BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ONE, null,
        "USD", null, null, null, Instant.now(), "OPEN", false, "test");
    when(pricing.getQuote("AAPL")).thenAnswer(call -> { entered.countDown(); release.await(); return aapl; });
    when(pricing.getQuote("MSFT")).thenReturn(msft);
    var cache = new QuoteCache(pricing, Duration.ofMinutes(1));
    var stuck = new Thread(() -> cache.fresh("AAPL"));
    stuck.start();
    try {
        assertTrue(entered.await(2, java.util.concurrent.TimeUnit.SECONDS));
        assertSame(msft, assertTimeoutPreemptively(Duration.ofSeconds(2), () -> cache.display("MSFT")));
    } finally {
        release.countDown();
        stuck.join(2000);
    }
 }
}
