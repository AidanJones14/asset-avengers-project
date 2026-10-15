/**
 * Current quantity per account/instrument, updated by order execution and read by
 * portfolio snapshots. The unique pair in SQL prevents duplicate positions. Fills
 * preserve execution history separately. HoldingController is legacy code behind the
 * nondefault holding profile and does not enforce account scoping; normal client
 * reads go through the authenticated BankAccountController snapshot instead.
 */
package com.avengers.endgame.holding;
