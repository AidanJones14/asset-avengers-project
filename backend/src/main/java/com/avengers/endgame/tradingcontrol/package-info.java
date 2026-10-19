/**
 * Authoritative account/instrument commands executed in the trading database.
 *
 * The staff-facing controllers, searches, reporting and Superset APIs live in
 * internal-backend. That service forwards an authorized command here over HTTP with the
 * admin's own token, which this API checks like any other request (ADMIN or SUPER_ADMIN,
 * by URL rule). The trading service owns the lock, state update and audit commit together.
 */
package com.avengers.endgame.tradingcontrol;
