/**
 * Persisted operational orders plus immutable execution and pricing evidence.
 * Order terms/status/reservations can change; TradeFill records actual rounded cash
 * settlement once per order. OrderPricingEvidence stores the observed quote, not a
 * newly fetched reconstruction. Enum names match the SQL checks and JSON contract.
 */
package com.avengers.endgame.order.domain;
