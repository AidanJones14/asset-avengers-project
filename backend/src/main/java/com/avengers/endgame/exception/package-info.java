/**
 * The one error handler for every controller: Problem Details with a code, plus errors[] for
 * invalid request fields. Unexpected failures are logged and answered with a generic 500, so
 * responses never leak database or token contents. Temporary quote/provider errors are separate:
 * they can defer an accepted order for retry.
 */
package com.avengers.endgame.exception;
