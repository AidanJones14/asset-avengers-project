/**
 * Stateless JWT verification and route permissions for the trading API. The Nest auth
 * service supplies HS256 tokens; this API checks signature, expiry, issuer and audience.
 * Decoded roles authorize routes, while CurrentUserService checks client ownership.
 * The independent internal backend has its own staff-only security configuration.
 */
package com.avengers.endgame.security;
