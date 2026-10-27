/**
 * HTTP entry point for client orders and display quotes. The controller takes the caller's id
 * from {@code @CurrentUserId} and passes it to OrderService, whose lookups are owner-scoped
 * (another client's order is a 404). Submission returns the saved order, accepted or rejected
 * (not enough cash); OrderExecutionWorker fills accepted ones later. DTOs and the error handler
 * define the client contract without exposing JPA entities.
 */
package com.avengers.endgame.order.controller;
