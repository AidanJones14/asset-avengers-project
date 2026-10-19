import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ThemeToggle } from '../../../shared/theme/theme-toggle';
import { BrandLogo } from '../../../shared/components/brand-logo/brand-logo';
import { PortfolioPreview } from '../../components/portfolio-preview/portfolio-preview';
import { errorMessage } from '../../api-error';
import { AuthService } from '../../auth.service';

// Shown when another part of the app sent the user here (AuthService.logout(reason)).
const REASONS: Record<string, string> = {
  password_changed: 'Your password has been updated. Log in with your new password.',
  idle: 'You were logged out after a period of inactivity.',
  expired: 'Your session ended. Please log in again.',
};

@Component({
  selector: 'app-auth-page',
  imports: [FormsModule, RouterLink, BrandLogo, PortfolioPreview, ThemeToggle],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.css',
})
export class AuthPage {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  readonly signup = this.route.snapshot.data['signup'] === true;
  readonly router = inject(Router);
  readonly reason = REASONS[this.route.snapshot.queryParamMap.get('reason') ?? ''] ?? '';
  readonly registered = !this.signup && this.route.snapshot.queryParamMap.get('registered') === 'true';
  readonly showPassword = signal(false);
  readonly submitted = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
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
    // Registration creates the account; sign-in remains an explicit separate step.
    const request = this.signup
      ? this.auth.register(this.email, this.password, this.firstName, this.lastName)
      : this.auth.login(this.email, this.password);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.password = '';
        this.confirmation = '';
        if (this.signup) {
          void this.router.navigate(['/login'], { queryParams: { registered: 'true' } });
          return;
        }
        if (this.auth.roles().includes('CLIENT')) {
          void this.router.navigateByUrl('/client/overview');
        } else {
          // Only client screens exist so far.
          this.auth.logout();
          this.error.set('Admin and analyst screens are not available yet.');
        }
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

