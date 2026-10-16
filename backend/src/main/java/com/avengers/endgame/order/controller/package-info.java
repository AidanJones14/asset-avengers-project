/**
 * HTTP entry point for client orders and display quotes. The controller checks the
 * verified client's account ownership before calling services. Submission returns a
 * persisted accepted commitment; OrderExecutionWorker fills it independently later.
 * DTOs and error handlers define the client contract without exposing JPA entities.
 */
package com.avengers.endgame.order.controller;
