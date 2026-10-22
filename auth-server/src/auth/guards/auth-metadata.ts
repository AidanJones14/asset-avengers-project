// Shared by the decorators and guards (kept separate so they don't import each other).
import type { Request } from 'express';
import type { AccessTokenClaims } from '../token.service.js';

// A request after JwtAuthGuard ran: `user` holds the verified token claims.
export type AuthenticatedRequest = Request & { user?: AccessTokenClaims };

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
