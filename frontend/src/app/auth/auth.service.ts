import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, map, Observable, of, shareReplay, tap, throwError } from 'rxjs';

/** What /auth/login and /auth/refresh return. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** The claims auth-server puts in every access token. */
export interface AccessClaims {
  sub: string;
  email: string;
  roles: string[];
  iat: number;
  exp: number;
}

/** Why the user landed on the login page; shown as a message there. */
export type LogoutReason = 'idle' | 'expired';

// sessionStorage is per tab and survives a reload. localStorage would be shared between tabs,
// and two tabs refreshing with the same one-time refresh token look like a replay to
// auth-server, which then revokes the session for both.
const REFRESH_TOKEN_KEY = 'endgame.refreshToken';

/**
 * Login state for the whole app. The access token lives only in memory; the refresh token is in
 * sessionStorage so a reload can get a new access token (see restoreSession).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly token = signal<string | null>(null);
  /** The current access token, sent to Spring by the interceptor. */
  readonly accessToken = this.token.asReadonly();
  /** Decoded claims of the current access token, or null when logged out. */
  readonly claims = computed(() => decodeClaims(this.token()));
  readonly isLoggedIn = computed(() => this.claims() !== null);
  readonly roles = computed(() => this.claims()?.roles ?? []);
  readonly email = computed(() => this.claims()?.email ?? '');

  // The refresh in flight, shared by everyone who asks while it runs (see refresh()).
  private inFlight: Observable<TokenPair> | null = null;

  /**
   * HttpClient returns an Observable: defining this pipeline does not send the request yet.
   * The request runs when the caller subscribes. `pipe` passes the emitted response through
   * each RxJS operator in order; it is similar to a chain of array transformations, but for
   * values that arrive asynchronously.
   */
  login(email: string, password: string): Observable<void> {
    return this.http.post<TokenPair>('/auth/login', { email, password }).pipe(
      // tap performs a side effect without changing the TokenPair flowing through the pipeline.
      tap((pair) => this.save(pair)),
      // The caller only needs to know that login completed, so hide the token response as void.
      map(() => undefined),
    );
  }

  /** Creates a CLIENT account. Returns no tokens: log in afterwards. */
  register(email: string, password: string): Observable<void> {
    return (
      this.http
        .post<{ id: string; email: string; registered: true }>('/auth/register', {
          email,
          password,
        })
        // Registration's response is not needed by the UI; success/completion is enough.
        .pipe(map(() => undefined))
    );
  }

  /**
   * Swaps the refresh token for a new pair. Only one request is ever sent at a time: every
   * refresh token works once, so a second parallel refresh would look like a replay and
   * auth-server would revoke the session.
   */
  refresh(): Observable<TokenPair> {
    const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return throwError(() => new Error('No refresh token'));

    // `??=` creates the request only when no refresh is already running. Merely returning the
    // same Observable would not normally prevent multiple HTTP calls because HttpClient
    // Observables are "cold" (each subscription starts a request); shareReplay below does.
    this.inFlight ??= this.http.post<TokenPair>('/auth/refresh', { refreshToken }).pipe(
      // Refresh-token rotation makes both returned tokens the new current pair.
      tap((pair) => this.save(pair)),
      // Runs on success, error, or unsubscribe so a later refresh may create a fresh request.
      finalize(() => (this.inFlight = null)),
      // Share one HTTP execution among current callers and replay its one result to late callers.
      shareReplay(1),
    );
    return this.inFlight;
  }

  /** At startup: turn a refresh token left by an earlier page load back into a session. */
  restoreSession(): Observable<unknown> {
    if (!sessionStorage.getItem(REFRESH_TOKEN_KEY)) return of(null);
    return this.refresh().pipe(
      // A stale/expired stored token is an expected "logged out" state during startup. Convert
      // that HTTP error into a successful null result so app initialization can still finish.
      catchError(() => {
        this.clear();
        return of(null);
      }),
    );
  }

  /** Ends the session on the server (best effort), clears local state, goes to /login. */
  logout(reason?: LogoutReason): void {
    const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
    this.clear();
    if (refreshToken) {
      // Fire and forget: the user is logged out locally whether or not this reaches the server.
      this.http.post('/auth/logout', { refreshToken }).subscribe({ error: () => undefined });
    }
    void this.router.navigate(['/login'], reason ? { queryParams: { reason } } : {});
  }

  private save(pair: TokenPair): void {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, pair.refreshToken);
    this.token.set(pair.accessToken);
  }

  private clear(): void {
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    this.token.set(null);
  }
}

/**
 * Reads (does not verify) a JWT's payload. The browser only uses it for display and timing;
 * Spring verifies the signature on every request.
 */
function decodeClaims(token: string | null): AccessClaims | null {
  if (!token) return null;
  try {
    // A JWT is header.payload.signature. Its payload uses URL-safe Base64, so translate the
    // URL-safe characters before atob decodes it, then parse the decoded JSON claims.
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)) as AccessClaims;
  } catch {
    return null;
  }
}
