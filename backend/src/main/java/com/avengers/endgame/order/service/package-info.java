/**
 * Submission, amendment/cancellation, scheduled execution and quote policy.
 * OrderService persists commitments; OrderExecutionWorker retries accepted orders;
 * OrderExecutionService settles balances, positions and immutable fills atomically.
 * QuoteCache saves display/monitoring requests while execution fetches again.
 * OrderAuditRecorder joins successful source transactions and separately commits
 * failed pricing evidence so rollback does not erase the attempted execution.
 */
package com.avengers.endgame.order.service;
