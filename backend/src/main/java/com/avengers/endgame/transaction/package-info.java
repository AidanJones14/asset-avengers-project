/**
 * Immutable deposit, withdrawal and dividend records. BankAccountService changes the
 * account balance in the same transaction as its cash event. SQL triggers append the
 * corresponding signed cash_ledger movement and outbox envelope. Buy/sell executions
 * are stored as TradeFill records, not duplicated as banking transactions.
 */
package com.avengers.endgame.transaction;
