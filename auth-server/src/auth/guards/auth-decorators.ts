// Route decorators for auth-server's access checks (staff-security plan 4.3, 4.5, 4.6).
// @Public() opts a route out of JwtAuthGuard; @Roles() adds RolesGuard; @CurrentUser() reads
// the claims JwtAuthGuard verified. Java equivalents: permitAll(), hasAnyRole(), @AuthenticationPrincipal.
import { SetMetadata, UseGuards, applyDecorators, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { StaffRole } from '../access-policy.js';
import type { AccessTokenClaims } from '../token.service.js';
import { IS_PUBLIC_KEY, ROLES_KEY, type AuthenticatedRequest } from './auth-metadata.js';
import { RolesGuard } from './roles.guard.js';

// No token needed (login, register, health...). On a controller class it covers every route.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Only these roles may call the route; anyone else with a valid token gets 403.
export const Roles = (...roles: StaffRole[]) =>
  applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(RolesGuard));

// The verified claims, or one claim: @CurrentUser() claims, @CurrentUser('sub') userId.
export const CurrentUser = createParamDecorator(
  (claim: keyof AccessTokenClaims | undefined, context: ExecutionContext) => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    return claim ? user?.[claim] : user;
  },
);
