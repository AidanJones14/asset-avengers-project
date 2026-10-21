import {
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { ViewportScroller } from "@angular/common";
import { FormsModule } from "@angular/forms";
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
  NavigationEnd,
} from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Title } from "@angular/platform-browser";
import { MfaChallenge, StaffApi, admits } from "./api";
import { Feedback, time } from "./shared";
import { ReportState } from "./report-state";
@Component({
  selector: "staff-app",
  imports: [FormsModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: "./app.html",
})
export class App {
  readonly api = inject(StaffApi);
  readonly feedback = inject(Feedback);
  readonly reports = inject(ReportState);
  readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly scroller = inject(ViewportScroller);
  private readonly injector = inject(Injector);
  readonly path = signal(this.router.url);
  readonly role = computed(() =>
    this.path().startsWith("/analyst") ? "ANALYST" : "ADMIN",
  );
  readonly base = computed(() =>
    this.role() === "ADMIN" ? "/admin" : "/analyst",
  );
  readonly name = computed(() =>
    this.role() === "ADMIN" ? "Ultron" : "J.A.R.V.I.S.",
  );
  readonly verified = signal(false);
  readonly connected = computed(
    () => this.verified() && admits(this.role(), this.api.claims()?.roles),
  );
  email = "";
  password = "";
  token = "";
  readonly lag = computed(() =>
    Math.max(0, Math.round(this.reports.status()["pipeline"]?.lagSeconds || 0)),
  );
  readonly time = time;
  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd)
        this.path.set(event.urlAfterRedirects);
    });
    effect(() => {
      this.title.setTitle(
        `${this.name()} · ${this.connected() ? "Staff workspace" : (this.role() === "ADMIN" ? "Admin" : "Analyst") + " login"}`,
      );
      if (!this.api.claims()) {
        this.verified.set(false);
        this.reports.reset();
      } else if (
        this.verified() &&
        !admits(this.role(), this.api.claims()!.roles)
      ) {
        this.verified.set(false);
        this.reports.reset();
        this.feedback.message.set(
          `This page requires ${this.role()} access. Use the correct role-specific login page.`,
        );
        void this.api.logout().catch(() => {});
      }
    });
  }
  refreshStatus() {
    return this.feedback.run("status", () => this.reports.refresh());
  }
  login() {
    return this.feedback.run("login", async () => {
      try {
        const email = this.email.trim();
        const challenge = await this.api.login(email, this.password);
        if (challenge && "passwordChangeRequired" in challenge) {
          // D3: hold the temporary password in memory for the next step only.
          this.pendingLogin = { email, password: this.password };
          this.choosingPassword.set(true);
        } else if (challenge) this.challenge.set(challenge);
        else await this.connect();
      } catch (error) {
        throw this.api.error(error);
      } finally {
        this.password = "";
      }
    });
  }
  readonly challenge = signal<MfaChallenge | null>(null);
  readonly recoveryCodes = signal<string[]>([]);
  mfaCode = "";
  resetStep = "";
  resetEmail = "";
  resetCode = "";
  newPassword = "";
  confirmation = "";
  resetNotice = "";
  private resetToken = "";
  private resetRequestToken = "";
  private resetRequestedAt = 0;
  // Staff security D3: a new account's first sign-in replaces its temporary password.
  readonly choosingPassword = signal(false);
  private pendingLogin: { email: string; password: string } | null = null;
  initialPassword = "";
  initialConfirmation = "";
  resetLogin() {
    this.choosingPassword.set(false); this.pendingLogin = null;
    this.initialPassword = ""; this.initialConfirmation = "";
    this.challenge.set(null); this.recoveryCodes.set([]); this.mfaCode = "";
    this.password = ""; this.resetStep = ""; this.resetToken = ""; this.resetRequestToken = "";
    this.resetCode = ""; this.newPassword = ""; this.confirmation = ""; this.resetNotice = "";
  }
  replaceAuthenticator() {
    return this.feedback.run("mfa", async () => {
      try { this.challenge.set(await this.api.startMfa(this.email.trim(), this.password)); }
      catch (error) { throw this.api.error(error); }
      finally { this.password = ""; }
    });
  }
  verifyMfa() {
    return this.feedback.run("mfa", async () => {
      const challenge = this.challenge();
      if (!challenge) return;
      try {
        const result = await this.api.completeMfa(challenge.challengeToken, this.mfaCode, challenge.purpose || "login");
        this.mfaCode = "";
        if ("mfaRequired" in result) this.challenge.set(result);
        else {
          this.challenge.set(null);
          if (result.recoveryCodes?.length) this.recoveryCodes.set(result.recoveryCodes);
          else await this.connect();
        }
      } catch (error) { throw this.api.error(error); }
    });
  }
  setInitialPassword() {
    return this.feedback.run("initial", async () => {
      const pending = this.pendingLogin;
      if (!pending) throw new Error("Start sign-in again.");
      if (this.initialPassword !== this.initialConfirmation) throw new Error("Passwords must match.");
      try {
        const result = await this.api.changeTemporaryPassword(pending.email, pending.password, this.initialPassword);
        this.resetLogin();
        // Staff continue to authenticator setup; anything else already has a session.
        if ("mfaRequired" in result) this.challenge.set(result);
        else await this.connect();
      } catch (error) { throw this.api.error(error); }
    });
  }
  finishRecovery() {
    return this.feedback.run("mfa", async () => { this.recoveryCodes.set([]); await this.connect(); });
  }
  requestReset() {
    return this.feedback.run("reset", async () => {
      if (Date.now() - this.resetRequestedAt < 60000) throw new Error("Wait one minute before requesting another code.");
      try {
        const result = await this.api.forgotPassword(this.resetEmail.trim());
        this.resetRequestToken = result.requestToken; this.resetToken = ""; this.resetRequestedAt = Date.now();
        this.resetStep = "code"; this.resetNotice = "If an account matches that address, a code will arrive shortly. Check your inbox and spam folder. Codes expire after 10 minutes.";
      } catch (error) { throw this.api.error(error); }
    });
  }
  verifyReset() {
    return this.feedback.run("reset", async () => {
      try { const result = await this.api.verifyResetCode(this.resetRequestToken, this.resetCode); this.resetToken = result.resetToken; this.resetRequestToken = ""; this.resetCode = ""; this.resetStep = "password"; }
      catch (error) { throw this.api.error(error); }
    });
  }
  savePassword() {
    return this.feedback.run("reset", async () => {
      if (this.newPassword !== this.confirmation) throw new Error("Passwords must match.");
      try { const result = await this.api.resetPassword(this.resetToken, this.newPassword); this.resetToken = ""; this.newPassword = ""; this.confirmation = ""; this.resetStep = "done"; this.resetNotice = result.message; }
      catch (error) { throw this.api.error(error); }
    });
  }
  tokenLogin() {
    return this.feedback.run("token", async () => {
      this.api.useToken(this.token.trim());
      await this.connect();
    });
  }
  private async connect() {
    if (!admits(this.role(), this.api.claims()?.roles)) {
      await this.api.logout().catch(() => {});
      throw new Error(
        `This page requires ${this.role()} access. Use the correct role-specific login page.`,
      );
    }
    try {
      await this.reports.refresh();
    } catch (error) {
      await this.api.logout().catch(() => {});
      throw error;
    }
    this.verified.set(true);
    afterNextRender(() => this.scroller.scrollToPosition([0, 0]), {
      injector: this.injector,
    });
    this.email = "";
    this.password = "";
    this.token = "";
    if ([this.base(), `${this.base()}.html`].includes(this.path()))
      await this.router.navigateByUrl(
        `${this.base()}/${this.role() === "ADMIN" ? "orders" : "reports"}`,
        { replaceUrl: true },
      );
    await this.reports.loadDashboards();
  }
  logout() {
    return this.feedback.run("logout", async () => {
      this.verified.set(false);
      this.reports.reset();
      await this.api.logout();
      await this.router.navigateByUrl(this.base(), { replaceUrl: true });
    });
  }
}
