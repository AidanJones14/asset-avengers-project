/**
 * Authoritative account/instrument commands executed in the trading database.
 *
 * The staff-facing controllers, searches, reporting and Superset APIs live in
 * internal-backend. That service forwards an authorized command here over HTTP;
 * the trading service must own the lock, state update and audit commit together.
 */
package com.avengers.endgame.tradingcontrol;
