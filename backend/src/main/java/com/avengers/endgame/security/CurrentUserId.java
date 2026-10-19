package com.avengers.endgame.security;

import org.springframework.security.core.annotation.AuthenticationPrincipal;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

// Owner: security layer. The one way a controller learns who is calling.
// Usage: put it on a controller parameter, e.g. list(@CurrentUserId UUID userId).
//   Controllers then pass that id to the service, which looks up only the caller's own data.
// How Spring uses it: when it calls a controller method, Spring sees @AuthenticationPrincipal on this
//   annotation and evaluates the expression below against the logged-in principal (the validated Jwt).
//   `subject` is jwt.getSubject(), the auth-server user id.

// Specifies that this annotation can be placed on parameter values (like in a controller endpoint)
@Target(ElementType.PARAMETER)
// This is so that spring is able to see the annotation during runtime
// Not like other annotations that are only relevant during configuration
@Retention(RetentionPolicy.RUNTIME)
// Gets JWT and then parses subject and converts to UUID
@AuthenticationPrincipal(expression = "T(java.util.UUID).fromString(subject)")
// Allows endpoint to directly just get the user uuid from the JWT instead of getting JWT and then getting subject field
public @interface CurrentUserId {
}
