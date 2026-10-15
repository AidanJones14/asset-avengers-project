/**
 * Translate order/business validation failures into HTTP responses. These failures
 * are distinct from temporary quote/provider errors, which can defer an accepted order
 * for retry. Controllers expose messages without leaking database or token contents.
 */
package com.avengers.endgame.exception;
