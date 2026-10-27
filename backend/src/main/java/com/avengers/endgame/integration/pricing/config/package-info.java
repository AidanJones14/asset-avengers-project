/**
 * Bind pricing environment/properties and configure the provider HTTP client.
 * Centralizing URL, credential and timeout settings allows tests to replace the
 * provider without changing order business logic. Secrets come from deployment.
 */
package com.avengers.endgame.integration.pricing.config;
