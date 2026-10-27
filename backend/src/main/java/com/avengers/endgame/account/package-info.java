/**
 * Trading cash accounts and their suspension state. A default account is opened with zero cash by
 * UserProvisioningService on the client's first request; additional accounts are opened through
 * AccountController. The entity and repository are shared by banking, order
 * validation/execution and the admin suspend commands. Pessimistic account locks serialize cash
 * changes and reservations.
 */
package com.avengers.endgame.account;
