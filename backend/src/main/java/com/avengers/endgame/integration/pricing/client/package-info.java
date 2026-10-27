/**
 * Provider boundary: PricingApiClient is the injectable contract, and FauxnancePricingApiClient
 * performs configured HTTP calls and parses provider responses. QuoteCache and
 * OrderQuoteService decide reuse and trading validity. The provider adapter does not
 * own accounts, execute orders or send its API credential to browsers.
 */
package com.avengers.endgame.integration.pricing.client;
