import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Only lets a logged-in user with this token role (CLIENT, ADMIN, ...) open the route; everyone
 * else goes to /login. This is for the UI only: Spring checks the role on every request.
 */
export function requireRole(role: string): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (auth.isLoggedIn() && auth.roles().includes(role)) return true;
    return router.createUrlTree(['/login']);
  };
}
