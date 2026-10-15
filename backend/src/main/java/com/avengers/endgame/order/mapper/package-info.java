/**
 * Translate order DTOs and entities without executing trades. OrderService assigns
 * accepted status/reservation and OrderExecutionService assigns final price/status.
 * Keeping these decisions out of mapping prevents an HTTP conversion from changing cash.
 */
package com.avengers.endgame.order.mapper;
