import { PasswordReset } from '../../components/password-reset';
import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ThemeToggle } from '../../../shared/theme/theme-toggle';
import { BrandLogo } from '../../../shared/components/brand-logo/brand-logo';
import { PortfolioPreview } from '../../components/portfolio-preview/portfolio-preview';
import { errorMessage } from '../../api-error';
import { switchMap } from 'rxjs';
import { AuthService } from '../../auth.service';

// Shown when another part of the app sent the user here (AuthService.logout(reason)).
const REASONS: Record<string, string> = {
  password_changed: 'Your password has been updated. Log in with your new password.',
  idle: 'You were logged out after a period of inactivity.',
  expired: 'Your session ended. Please log in again.',
};

@Component({
  selector: 'app-auth-page',
  imports: [PasswordReset, FormsModule, RouterLink, BrandLogo, PortfolioPreview, ThemeToggle],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.css',
})
export class AuthPage {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  readonly signup = this.route.snapshot.data['signup'] === true;
  readonly router = inject(Router);
  readonly reason = REASONS[this.route.snapshot.queryParamMap.get('reason') ?? ''] ?? '';
  readonly showPassword = signal(false);
  readonly submitted = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly challenge = this.auth.mfaChallenge;
  readonly recoveryCodes = signal<string[]>([]);
  readonly mfaNotice = signal('');
  readonly showReset = signal(false);
  mfaPurpose: 'login' | 'enroll' | 'replace' | 'replace-enroll' = 'login';
  code = '';

  startMfa(purpose: 'enroll' | 'replace') {
    if (!this.email || !this.password) { this.error.set('Enter your email and password first.'); return; }
    this.busy.set(true); this.error.set(''); this.mfaNotice.set('');
    this.auth.startMfa(this.email, this.password, purpose).subscribe({
      next: () => { this.mfaPurpose = purpose; this.password = ''; this.busy.set(false); },
      error: err => { this.busy.set(false); this.password = ''; this.error.set(errorMessage(err)); },
    });
  }

  verifyMfa() {
    this.busy.set(true); this.error.set('');
    this.auth.completeMfa(this.code, this.mfaPurpose).subscribe({
      next: result => {
        this.busy.set(false); this.code = '';
        if ('mfaRequired' in result) { this.mfaPurpose = result.purpose ?? 'replace-enroll'; return; }
        if (result.recoveryCodes?.length) {
          this.recoveryCodes.set(result.recoveryCodes);
          this.mfaNotice.set('Authenticator verified. Save your recovery codes to finish signing in.');
        } else this.enterClient();
      },
      error: err => { this.busy.set(false); this.code = ''; this.error.set(errorMessage(err)); },
    });
  }

  finishEnrollment() { this.recoveryCodes.set([]); this.mfaNotice.set(''); this.enterClient(); }

  cancelMfa() { this.challenge.set(null); this.code = ''; this.error.set(''); this.mfaPurpose = 'login'; }

  private enterClient() {
    if (this.auth.roles().includes('CLIENT')) void this.router.navigateByUrl('/client/overview');
    else { this.auth.logout(); this.error.set('Use the separate Ultron or J.A.R.V.I.S. sign-in page for staff access.'); }
  }
  mfaEnabled = false;
  firstName = '';
  lastName = '';
  email = '';
  password = '';
  confirmation = '';
  get mismatch() {
    return this.signup && this.password !== this.confirmation;
  }
  submit(form: NgForm) {
    if (this.busy()) return;
    this.submitted.set(true);
    this.error.set('');
    if (form.invalid || this.mismatch || (this.signup && (!this.firstName.trim() || !this.lastName.trim()))) {
      form.control.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    // Registration saves the MFA choice; login starts setup only when opted in.
    const request = this.signup
      ? this.auth.register(this.email, this.password, this.firstName, this.lastName, this.mfaEnabled).pipe(switchMap(() => this.auth.login(this.email, this.password)))
      : this.auth.login(this.email, this.password);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.password = '';
        this.confirmation = '';
        this.mfaPurpose = this.challenge()?.purpose ?? 'login';
        if (!this.challenge()) this.enterClient();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.password = '';
        this.confirmation = '';
        this.error.set(
          errorMessage(
            err,
            this.signup
              ? { 409: 'That email is already registered. Log in instead.' }
              : { 401: 'Invalid email or password.' },
          ),
        );
      },
    });
  }
}

