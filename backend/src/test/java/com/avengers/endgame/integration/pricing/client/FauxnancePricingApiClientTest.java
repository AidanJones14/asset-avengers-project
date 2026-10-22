package com.avengers.endgame.integration.pricing.client;

import com.avengers.endgame.integration.pricing.config.PricingApiProperties;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.http.HttpMethod.GET;

class FauxnancePricingApiClientTest {

    @Test
    void getQuote_mapsWrappedResponseIntoFlatQuoteResponse() {
        PricingApiProperties properties = new PricingApiProperties();
        properties.setBaseUrl("https://api.example.test");
        properties.setQuotesPath("/quotes");
        properties.setKey("test-key");

        RestClient.Builder builder = RestClient.builder()
                .baseUrl(properties.getBaseUrl())
                .defaultHeader("X-Api-Key", properties.getKey());
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        RestClient restClient = builder.build();

        FauxnancePricingApiClient client = new FauxnancePricingApiClient(restClient, properties, new ObjectMapper());

        String payload = """
                {
                  "data": {
                    "symbol": "AAPL",
                    "price": 336.67,
                    "bid": 336.63,
                    "ask": 336.71,
                    "spreadBps": 1.8467,
                    "currency": "USD",
                    "change": 3.04,
                    "changePercent": 0.91118904175284,
                    "previousClose": 333.63,
                    "asOf": "2026-10-07T20:00:01Z",
                    "marketState": "unknown"
                  },
                  "meta": {
                    "asOf": "2026-10-07T20:00:01Z",
                    "disclaimer": "Educational data. Not for investment use.",
                    "symbol": "AAPL",
                    "source": "cache",
                    "stale": false,
                    "spreadSource": "modelled"
                  }
                }
                """;

        server.expect(requestTo("https://api.example.test/quotes/AAPL"))
                .andExpect(method(GET))
                .andRespond(withSuccess(payload, MediaType.APPLICATION_JSON));

        QuoteResponse quote = client.getQuote("AAPL");

        assertEquals("AAPL", quote.symbol());
        assertEquals(new BigDecimal("336.67"), quote.price());
        assertEquals(new BigDecimal("336.63"), quote.bid());
        assertEquals(new BigDecimal("336.71"), quote.ask());
        assertEquals(new BigDecimal("1.8467"), quote.spreadBps());
        assertEquals("USD", quote.currency());
        assertEquals(new BigDecimal("3.04"), quote.change());
        assertEquals(new BigDecimal("0.91118904175284"), quote.changePercent());
        assertEquals(new BigDecimal("333.63"), quote.previousClose());
        assertEquals(Instant.parse("2026-10-07T20:00:01Z"), quote.asOf());
        assertEquals("unknown", quote.marketState());
        assertFalse(Boolean.TRUE.equals(quote.stale()));
        assertEquals("cache", quote.source());

        server.verify();
    }

    // Order freeze: a provider that accepts the connection and never answers must fail fast
    // (PricingApiException, mapped to 502) instead of hanging the caller and its row locks.
    @Test
    void getQuote_failsWhenTheProviderNeverAnswers() throws Exception {
        try (var silent = new java.net.ServerSocket(0)) {
            var accepted = new java.util.ArrayList<java.net.Socket>();
            var acceptor = new Thread(() -> {
                try { while (true) accepted.add(silent.accept()); } catch (java.io.IOException closed) { }
            });
            acceptor.setDaemon(true);
            acceptor.start();
            PricingApiProperties properties = new PricingApiProperties();
            properties.setBaseUrl("http://127.0.0.1:" + silent.getLocalPort());
            properties.setQuotesPath("/quotes");
            properties.setKey("test-key");
            properties.setReadTimeout(java.time.Duration.ofMillis(300));
            RestClient restClient = new com.avengers.endgame.integration.pricing.config.PricingClientConfig()
                    .pricingRestClient(properties);
            FauxnancePricingApiClient client = new FauxnancePricingApiClient(restClient, properties, new ObjectMapper());

            org.junit.jupiter.api.Assertions.assertThrows(com.avengers.endgame.integration.pricing.exception.PricingApiException.class, () ->
                    org.junit.jupiter.api.Assertions.assertTimeoutPreemptively(java.time.Duration.ofSeconds(5),
                            () -> client.getQuote("AAPL")));
        }
    }
}
