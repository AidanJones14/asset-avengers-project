/**
 * Order HTTP input/output shapes. Request validation checks basic fields before the
 * service performs locked resource checks; response mapping excludes persistence
 * internals. A requested limit/stop price is a condition, not the eventual fill price.
 * Changes here must be reflected in the Angular order API types and endpoint docs.
 */
package com.avengers.endgame.order.dto;
