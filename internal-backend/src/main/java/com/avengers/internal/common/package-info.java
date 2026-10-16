/**
 * Shared staff API response/error support. Rows adapts JDBC snake_case columns and
 * database timestamps to JSON-friendly fields. InternalExceptionHandler reports
 * dependency failures without exposing SQL credentials or raw database messages.
 * These utilities depend on reporting contracts, not trading JPA entities.
 */
package com.avengers.internal.common;
