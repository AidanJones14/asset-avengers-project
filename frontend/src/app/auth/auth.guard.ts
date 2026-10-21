import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';
import { AccountApiService } from '../api/accounts/account-api.service';

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

/** Only allows investment-account routes after the authenticated user owns an account. */
export const requireInvestmentAccount: CanActivateFn = () => {
  const router = inject(Router);
  const accounts = inject(AccountApiService);
  return accounts.getAccounts().pipe(
    map((ownedAccounts) => ownedAccounts.length > 0
      ? true
      : router.createUrlTree(['/client/accounts'])),
    catchError(() => of(router.createUrlTree(['/client/accounts']))),
  );
};
