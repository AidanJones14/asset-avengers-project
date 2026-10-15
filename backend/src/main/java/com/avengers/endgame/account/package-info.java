/**
 * Trading cash accounts and suspension state. CurrentUserService resolves the verified
 * client and creates a zero-cash account; AccountController uses that path. The entity
 * and repository are shared by banking, order validation/execution and staff commands.
 * Pessimistic account locks serialize cash changes and reservations. DTOs/mappers
 * control HTTP fields; the older AccountService creation helper is not client onboarding.
 */
package com.avengers.endgame.account;
