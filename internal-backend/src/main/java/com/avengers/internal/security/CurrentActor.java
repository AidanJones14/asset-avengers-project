package com.avengers.internal.security;

import org.springframework.security.core.annotation.AuthenticationPrincipal;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

// Owner: security layer. The admin making the request, as admin_audit_log records it: the verified
// token's `sub` and `email`. Replaces AdminActorResolver: the URL rules already decided the role, so
// this only reads identity. Usage: getAccount(@PathVariable UUID id, @CurrentActor AdminActor actor).
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@AuthenticationPrincipal(expression =
        "new com.avengers.internal.admin.AdminActor(T(java.util.UUID).fromString(subject), getClaimAsString('email'))")
public @interface CurrentActor {
}
