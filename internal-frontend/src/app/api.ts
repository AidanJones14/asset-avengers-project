import { Injectable, inject, signal } from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { firstValueFrom, timeout } from "rxjs";

export interface StaffClaims {
  sub: string;
  email?: string;
  name?: string;
  roles: string[];
  session_exp?: number;
}
export interface MfaChallenge {
  mfaRequired: true;
  challengeToken: string;
  purpose?: string;
  enrollmentRequired?: boolean;
  qrDataUrl?: string;
  secret?: string;
}
interface TokenPair {
  accessToken: string;
  refreshToken?: string;
}
// Staff security D3: a new staff account's login answer. No tokens until it picks its own password.
export interface PasswordChangeRequired {
  passwordChangeRequired: true;
}
export interface RequestOptions {
  method?: string;
  body?: unknown;
  download?: boolean;
  // internal-backend's /api/v1/ by default; the staff-account calls use auth-server's /auth/admin/staff.
  base?: string;
}
// Staff roles that can hold a console session; the servers decide the real access.
const STAFF_ROLES = ["ANALYST", "ADMIN", "SUPER_ADMIN"];
/** The admin workspace also admits SUPER_ADMIN; the analyst workspace stays ANALYST-only. */
export const admits = (workspace: string, roles: string[] = []) =>
  roles.includes(workspace) ||
  (workspace === "ADMIN" && roles.includes("SUPER_ADMIN"));
export const aborted = () =>
  new DOMException("Session or page changed", "AbortError");

/** Tokens stay in memory. The backend remains the authority for every role check. */
@Injectable({ providedIn: "root" })
export class StaffApi {
  private readonly http = inject(HttpClient);
  readonly claims = signal<StaffClaims | null>(null);
  private session: TokenPair | null = null;
  revision = 0;
  private sessionExpiryTimer?: ReturnType<typeof setTimeout>;
  private pendingRefresh: Promise<void> | null = null;

  private save(pair: TokenPair) {
    let user: StaffClaims;
    try {
      const payload = pair.accessToken
        .split(".")[1]
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      user = JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(atob(payload), (c) => c.charCodeAt(0)),
        ),
      );
    } catch {
      throw new Error("The access token is not valid.");
    }
    if (
      !Array.isArray(user.roles) ||
      !user.roles.some((role) => STAFF_ROLES.includes(role))
    )
      throw new Error("This console requires an ADMIN or ANALYST account.");
    this.session = pair;
    this.claims.set(user);
    clearTimeout(this.sessionExpiryTimer);
    if (Number.isFinite(user.session_exp)) this.sessionExpiryTimer = setTimeout(() => this.clearSession(), Math.max(0, user.session_exp! * 1000 - Date.now()));
  }
  private send<T>(
    url: string,
    method: string,
    body?: unknown,
    token?: string,
    download = false,
  ): Promise<T> {
    return firstValueFrom(
      this.http
        .request<T>(method, url, {
          body,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          responseType: (download ? "blob" : "json") as "json",
        })
        .pipe(timeout(20000)),
    );
  }
  private auth<T>(path: string, body: unknown) {
    return this.send<T>(`/auth/${path}`, "POST", body);
  }
  async login(email: string, password: string) {
    const version = ++this.revision;
    const pair = await this.auth<TokenPair | MfaChallenge | PasswordChangeRequired>("login", { email, password });
    if (version !== this.revision) throw aborted();
    // Neither answer has tokens: an MFA challenge, or a new account's required password change.
    if ("mfaRequired" in pair || "passwordChangeRequired" in pair) return pair;
    try {
      this.save(pair);
    } catch (error) {
      await this.auth("logout", { refreshToken: pair.refreshToken }).catch(
        () => {},
      );
      throw error;
    }
  }
  // D3: password is the temporary one. The answer is the enrollment challenge, as after a login.
  async changeTemporaryPassword(email: string, password: string, newPassword: string) {
    const version = this.revision;
    const result = await this.auth<TokenPair | MfaChallenge>("change-temporary-password", { email, password, newPassword });
    if (version !== this.revision) throw aborted();
    if (!("mfaRequired" in result)) { this.save(result); this.revision++; }
    return result;
  }
  startMfa(email: string, password: string) {
    return this.auth<MfaChallenge>("mfa/replace/start", { email, password });
  }
  async completeMfa(challengeToken: string, code: string, purpose: string) {
    const version = this.revision;
    const endpoint = purpose === "login" ? "verify" : purpose === "enroll" ? "enable" : purpose === "replace" ? "replace/verify" : "replace/enable";
    const result = await this.auth<(TokenPair & { recoveryCodes?: string[] }) | MfaChallenge>(`mfa/${endpoint}`, { challengeToken, code });
    if (version !== this.revision) throw aborted();
    if (!("mfaRequired" in result)) { this.save(result); this.revision++; }
    return result;
  }
  forgotPassword(email: string) { return this.auth<{requestToken: string}>("forgot-password", {email}); }
  verifyResetCode(requestToken: string, code: string) { return this.auth<{resetToken: string}>("verify-reset-code", {requestToken, code}); }
  resetPassword(resetToken: string, newPassword: string) { return this.auth<{message: string}>("reset-password", {resetToken, newPassword}); }
  async supersetTicket() {
    await this.refresh();
    const version = this.revision;
    const result = await this.auth<{ticket: string}>("superset/ticket", {refreshToken: this.session!.refreshToken});
    if (version !== this.revision) throw aborted();
    return result;
  }
  useToken(token: string) {
    this.save({ accessToken: token });
    this.revision++;
  }
  clearSession() {
    clearTimeout(this.sessionExpiryTimer);
    this.session = null;
    this.claims.set(null);
    this.revision++;
  }
  async logout() {
    await this.pendingRefresh?.catch(() => {});
    const token = this.session?.refreshToken;
    this.clearSession();
    if (token) await this.auth("logout", { refreshToken: token });
  }
  private async refresh() {
    if (!this.session?.refreshToken) {
      this.clearSession();
      throw new Error("Session expired. Please sign in again.");
    }
    if (!this.pendingRefresh) {
      const version = this.revision;
      const task = this.auth<TokenPair>("refresh", {
        refreshToken: this.session.refreshToken,
      })
        .then((pair) => {
          if (version !== this.revision) throw aborted();
          this.save(pair);
        })
        .catch((error) => {
          if (version === this.revision) this.clearSession();
          throw error;
        })
        .finally(() => {
          if (this.pendingRefresh === task) this.pendingRefresh = null;
        });
      this.pendingRefresh = task;
    }
    await this.pendingRefresh;
  }
  async request<T = any>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    if (!this.session) throw new Error("Please sign in first.");
    const version = this.revision;
    const usedToken = this.session.accessToken;
    const check = () => {
      if (version !== this.revision || !this.session) throw aborted();
    };
    const send = () =>
      this.send<T>(
        `${options.base ?? "/api/v1/"}${path}`,
        options.method || "GET",
        options.body,
        this.session!.accessToken,
        options.download,
      );
    try {
      let result: T;
      try {
        result = await send();
      } catch (error) {
        check();
        if (!(error instanceof HttpErrorResponse) || error.status !== 401)
          throw error;
        if (this.session!.accessToken === usedToken) await this.refresh();
        check();
        try {
          result = await send();
        } catch (retryError) {
          check();
          if (
            retryError instanceof HttpErrorResponse &&
            retryError.status === 401
          )
            this.clearSession();
          throw retryError;
        }
      }
      check();
      return result;
    } catch (error) {
      if (error instanceof DOMException) throw error;
      throw this.error(error);
    }
  }
  error(error: unknown): Error {
    if (!(error instanceof HttpErrorResponse))
      return error instanceof Error ? error : new Error("The request failed.");
    // auth-server's rate limit (20 per 15 minutes per route) answers with a technical detail.
    if (error.status === 429)
      return new Error("Too many requests. Wait a few minutes, then try again.");
    const fallback: Record<number, string> = {
      401: "Please sign in again.",
      403: "Your account does not have permission.",
      404: "The requested record was not found.",
      502: "A service is unavailable. Check that the stacks are running.",
      503: "Reporting data is temporarily unavailable.",
    };
    const detail =
      error.error?.detail ||
      error.error?.message ||
      fallback[error.status] ||
      `Request failed (${error.status}).`;
    return new Error(Array.isArray(detail) ? detail.join(" ") : detail);
  }
}
