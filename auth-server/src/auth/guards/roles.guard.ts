// Role check for routes marked @Roles(...) (staff-security plan 4.5). Bound per route by @Roles,
// so it always runs after the global JwtAuthGuard has put the verified claims on request.user.
import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, type AuthenticatedRequest } from './auth-metadata.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];
    const roles = context.switchToHttp().getRequest<AuthenticatedRequest>().user?.roles ?? [];
    // Allowed if any of the caller's token roles is listed; otherwise 403.
    if (roles.some((role) => allowed.includes(role))) return true;
    throw new ForbiddenException('Your account does not have permission.');
  }
}
