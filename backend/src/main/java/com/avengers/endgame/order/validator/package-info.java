/**
 * Business validation within the caller's transaction. OrderValidator locks the account
 * and subtracts other open cash/share commitments before accepting another order.
 * The caller must retain that lock through persistence. Validation returns the exact
 * quote it used so submission audit does not make a second provider request.
 */
package com.avengers.endgame.order.validator;
