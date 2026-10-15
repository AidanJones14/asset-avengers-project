/**
 * Shared instrument metadata from the canonical SQL catalogue or verified ticker
 * discovery. InstrumentService uses QuoteCache to validate unknown symbols and an
 * atomic repository insert to handle concurrent lookups. Discovery commits independently
 * of an order, preserving verified metadata when the later trade fails. DTOs/mappers
 * expose metadata; prices and client holdings are not catalogue fields.
 */
package com.avengers.endgame.instrument;
