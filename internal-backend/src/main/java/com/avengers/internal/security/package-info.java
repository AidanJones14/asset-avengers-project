/**
 * Verify the shared auth JWT independently and authorize ADMIN/ANALYST routes.
 * AdminActorResolver reads the verified subject/email for audit identity; request
 * headers cannot choose an actor. Staff UI navigation only reflects these permissions.
 */
package com.avengers.internal.security;
