/**
 * Provider access/parsing failures. These propagate through quote services rather than
 * creating synthetic prices; the execution worker can defer the accepted order.
 * Pricing validation evidence is handled separately by QuoteValidationException.
 */
package com.avengers.endgame.integration.pricing.exception;
