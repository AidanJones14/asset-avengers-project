import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Adds the access token to Spring API calls, and on a 401 refreshes once and retries.
 * Registered in app.config.ts with provideHttpClient(withInterceptors([authInterceptor])).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Only Spring gets the token. /auth/* calls never carry it, and their 401s (wrong password,
  // dead refresh token) are answers for the caller, not a reason to refresh.
  if (!req.url.startsWith('/api/')) return next(req);

  const auth = inject(AuthService);
  const withToken = () => {
    const token = auth.accessToken();
    return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  };

  return next(withToken()).pipe(
    catchError((err: unknown) => {
      // 403, 404, 422, ... belong to the component that made the call.
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) return throwError(() => err);

      return auth.refresh().pipe(
        // Placed before switchMap, so it only sees refresh failures: the session is over.
        catchError((refreshErr: unknown) => {
          auth.logout('expired');
          return throwError(() => refreshErr);
        }),
        // Retry once with the new token. A second 401 goes to the caller.
        switchMap(() => next(withToken())),
      );
    }),
  );
};
