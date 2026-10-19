/**
 * Translate order DTOs and entities without executing trades. OrderService assigns the
 * submission status (accepted or rejected) and reservation; OrderExecutionService assigns
 * the final price/status. Keeping these decisions out of mapping prevents an HTTP
 * conversion from changing cash.
 */
package com.avengers.endgame.order.mapper;
