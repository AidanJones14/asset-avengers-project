/**
 * Simulated funding and the client portfolio snapshot. The controller takes the caller's id from
 * {@code @CurrentUserId}; BankAccountService finds only the caller's own bank accounts (anyone
 * else's is a 404) and changes cash together with a transaction record. Snapshot reads combine
 * account, holdings, fills, orders and watchlist under repeatable-read isolation. PositionReturns
 * uses actual fill amounts for average cost; bank numbers are masked only in responses.
 */
package com.avengers.endgame.bankaccount;
