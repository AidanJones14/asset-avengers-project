import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';

/** No input for this long opens the "Still there?" dialog (W). */
export const WARN_AFTER_MS = 13 * 60_000;
/**
 * How long the dialog counts down before logging out (C). Must stay under the server's idle
 * timeout minus the access token's lifetime (30 − 15 = 15 min): the last keepalive can be up to
 * one token lifetime before the user went idle, so that's all the server is guaranteed to have left.
 */
export const COUNTDOWN_MS = 2 * 60_000;

const CHECK_EVERY_MS = 1_000;
// Only user input counts as activity. HTTP calls (e.g. polling) don't, or an idle tab would
// stay logged in until the 12-hour limit.
const INPUT_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Client-side idle timeout. auth-server only sees refreshes (each one pushes its 30-minute idle
 * deadline forward), so this service decides what "active" means:
 * - while the user is active, refresh shortly before the access token expires (keepalive);
 * - after WARN_AFTER_MS without input, show the dialog; "Stay" refreshes, and when the
 *   countdown ends the user is logged out.
 */
@Injectable({ providedIn: 'root' })
export class IdleService {
  private readonly auth = inject(AuthService);
  private lastInput = Date.now();
  private keepaliveTimer?: ReturnType<typeof setTimeout>;

  /** True while the "Still there?" dialog should be open. */
  readonly warning = signal(false);
  /** Time left on the countdown, for the dialog. */
  readonly remainingMs = signal(COUNTDOWN_MS);

  constructor() {
    const onInput = () => {
      // While the dialog is open, only its "Stay" button counts.
      if (!this.warning()) this.lastInput = Date.now();
    };
    const check = () => this.check();
    for (const type of INPUT_EVENTS) {
      document.addEventListener(type, onInput, { capture: true, passive: true });
    }
    // Browsers slow timers in background tabs, so also check the moment the tab is shown again.
    document.addEventListener('visibilitychange', check);
    const interval = setInterval(check, CHECK_EVERY_MS);

    // Re-arm the keepalive every time a new access token arrives.
    effect(() => {
      const claims = this.auth.claims();
      this.scheduleKeepalive(claims?.iat, claims?.exp);
    });

    inject(DestroyRef).onDestroy(() => {
      for (const type of INPUT_EVENTS) {
        document.removeEventListener(type, onInput, { capture: true });
      }
      document.removeEventListener('visibilitychange', check);
      clearInterval(interval);
      clearTimeout(this.keepaliveTimer);
    });
  }

  /** The dialog's "Stay logged in" button. */
  stay(): void {
    this.lastInput = Date.now();
    this.warning.set(false);
    this.auth.refresh().subscribe({ error: () => this.auth.logout('expired') });
  }

  private check(): void {
    if (!this.auth.isLoggedIn()) {
      this.warning.set(false);
      this.lastInput = Date.now();
      return;
    }
    // Compare wall-clock times instead of counting ticks, so a throttled tab still adds up.
    const idleFor = Date.now() - this.lastInput;
    if (idleFor >= WARN_AFTER_MS + COUNTDOWN_MS) {
      this.warning.set(false);
      this.auth.logout('idle');
    } else if (idleFor >= WARN_AFTER_MS) {
      this.remainingMs.set(WARN_AFTER_MS + COUNTDOWN_MS - idleFor);
      this.warning.set(true);
    }
  }

  private scheduleKeepalive(iat?: number, exp?: number): void {
    clearTimeout(this.keepaliveTimer);
    if (!iat || !exp) return;
    // Refresh 60 s before expiry (or a quarter of the lifetime, for short test tokens like 1m).
    const lifetimeMs = (exp - iat) * 1000;
    const leadMs = Math.min(60_000, lifetimeMs / 4);
    const delayMs = Math.max(exp * 1000 - leadMs - Date.now(), 0);
    this.keepaliveTimer = setTimeout(() => {
      const active = Date.now() - this.lastInput < WARN_AFTER_MS;
      // Idle users get no keepalive: the dialog decides whether the session continues.
      if (active) this.auth.refresh().subscribe({ error: () => this.auth.logout('expired') });
    }, delayMs);
  }
}
