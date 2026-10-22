/**
 * Verify the shared auth JWT independently (issuer, audience endgame-staff, MFA proof) and authorize
 * ADMIN/SUPER_ADMIN and ANALYST routes by URL. Controllers read the verified identity only through
 * {@code @CurrentUserId} and {@code @CurrentActor}; request headers cannot choose an actor. Staff UI
 * navigation only reflects these permissions.
 */
package com.avengers.internal.security;
