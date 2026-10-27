/**
 * The request flow for the trading API, in order. SecurityConfig verifies the HS256 token from
 * auth-server (signature, expiry, issuer, audience: 401) and checks the URL's roles (403; anything
 * without a rule is denied). UserProvisioningInterceptor then keeps the caller's users row, and a
 * client's trading account, in step with the token. {@code @CurrentUserId} gives controllers the
 * caller's id, and the services scope data to it. internal-backend has its own staff security.
 */
package com.avengers.endgame.security;
