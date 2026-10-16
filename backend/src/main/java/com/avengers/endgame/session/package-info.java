/**
 * Bridge from a verified auth JWT to the client's persisted trading identity/account.
 * CurrentUserService uses the permanent subject UUID and locks the user before account
 * creation, preventing concurrent first requests from creating duplicate portfolios.
 * It checks ownership before client operations; it does not validate passwords.
 */
package com.avengers.endgame.session;
