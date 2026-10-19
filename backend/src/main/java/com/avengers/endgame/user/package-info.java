/**
 * Trading identities keyed by the auth token's subject UUID; no passwords or refresh tokens.
 * Only UserProvisioningService creates rows and keeps them in step with the token (email, role,
 * names), on every signed-in request. The stored role backs database constraints (staff never
 * own trading accounts); the token's roles, checked in SecurityConfig, decide access.
 */
package com.avengers.endgame.user;
