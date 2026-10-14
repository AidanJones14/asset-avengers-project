import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { BrandLogo } from '../../../shared/components/brand-logo/brand-logo';
import { PortfolioPreview } from '../../components/portfolio-preview/portfolio-preview';
import { errorMessage } from '../../api-error';
import { AuthService } from '../../auth.service';

// Shown when another part of the app sent the user here (AuthService.logout(reason)).
const REASONS: Record<string, string> = {
  idle: 'You were logged out after a period of inactivity.',
  expired: 'Your session ended. Please log in again.',
};

@Component({
  selector: 'app-auth-page',
  imports: [FormsModule, RouterLink, BrandLogo, PortfolioPreview],
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
  email = '';
  password = '';
  confirmation = '';
  get mismatch() {
    return this.signup && this.password !== this.confirmation;
  }
  submit(form: NgForm) {
    this.submitted.set(true);
    this.error.set('');
    if (form.invalid || this.mismatch) {
      form.control.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    // Register returns no tokens, so a new account logs straight in afterwards.
    const request = this.signup
      ? this.auth.register(this.email, this.password).pipe(switchMap(() => this.auth.login(this.email, this.password)))
      : this.auth.login(this.email, this.password);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.password = '';
        this.confirmation = '';
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

