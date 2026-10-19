/**
 * Trading cash accounts and their suspension state. Each client has exactly one, opened with zero
 * cash by UserProvisioningService on their first request; AccountController returns it through
 * AccountService.getForUser. The entity and repository are shared by banking, order
 * validation/execution and the admin suspend commands. Pessimistic account locks serialize cash
 * changes and reservations.
 */
package com.avengers.endgame.account;
