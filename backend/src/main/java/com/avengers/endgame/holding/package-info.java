/**
 * Current quantity per account/instrument, updated by order execution and read by
 * portfolio snapshots. The unique pair in SQL prevents duplicate positions. Fills
 * preserve execution history separately. Clients read their holdings through the
 * BankAccountController snapshot, which is scoped to the caller.
 */
package com.avengers.endgame.holding;
