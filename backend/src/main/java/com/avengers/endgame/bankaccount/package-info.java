/**
 * Simulated funding and the client portfolio snapshot. Controllers derive the user
 * from the verified JWT before BankAccountService checks bank ownership and changes
 * cash with a transaction record. Snapshot reads combine account, holdings, fills,
 * orders and watchlist under repeatable-read isolation. PositionReturns uses actual
 * fill amounts for average cost; bank numbers are masked only in responses.
 */
package com.avengers.endgame.bankaccount;
