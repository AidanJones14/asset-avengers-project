/**
 * Persistence queries for orders, fills and pricing evidence. Locked order lookups
 * protect execution/cancellation/amendments; open-order queries calculate commitments.
 * Immutable fill/evidence inserts trigger SQL audit/outbox capture. Real PostgreSQL
 * tests validate these constraints because H2 does not reproduce the source triggers.
 */
package com.avengers.endgame.order.repository;
