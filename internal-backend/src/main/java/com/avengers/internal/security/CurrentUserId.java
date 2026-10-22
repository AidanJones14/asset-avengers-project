package com.avengers.internal.security;

import org.springframework.security.core.annotation.AuthenticationPrincipal;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

// Owner: security layer. The caller's auth-server user id (the verified token's `sub`) as a UUID.
// Usage: a controller parameter, e.g. request(@CurrentUserId UUID userId). Copied from the trading backend.
// How Spring uses it: @AuthenticationPrincipal evaluates the expression against the validated Jwt.
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@AuthenticationPrincipal(expression = "T(java.util.UUID).fromString(subject)")
public @interface CurrentUserId {
}
