// Global authentication for auth-server (staff-security plan 4.4), registered as APP_GUARD in
// auth.module.ts, so it runs before every route's own guards. Like Spring's JWT filter chain:
// every route needs a valid access token unless it is marked @Public().
import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenService } from '../token.service.js';
import { IS_PUBLIC_KEY, type AuthenticatedRequest } from './auth-metadata.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. @Public() on the route or its controller: no token needed.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // 2. A bearer token is required.
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Please log in again.');

    // 3. Verify it (signature, expiry, issuer, audience, MFA proof). One message for every failure.
    try {
      request.user = this.tokens.validateAccessToken(header.slice(7));
    } catch {
      throw new UnauthorizedException('Please log in again.');
    }
    return true;
  }
}
