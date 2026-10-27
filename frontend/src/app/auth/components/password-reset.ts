/** Password recovery is a three-step server-enforced flow. The email-code
 * challenge and verified reset grant stay in memory and never grant app access. */
import { Component, inject, output, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { errorMessage } from '../api-error';
@Component({
  selector: 'app-password-reset',
  imports: [FormsModule],
  templateUrl: './password-reset.html',
  styleUrl: './password-reset.css',
})
export class PasswordReset {
  private readonly http = inject(HttpClient);
  readonly closed = output<void>();
  readonly stage = signal<'email' | 'code' | 'password' | 'done'>('email');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly passwordReused = signal(false);
  email = '';
  code = '';
  password = '';
  confirmation = '';
  private requestToken = '';
  private resetToken = '';
  private requestedAt = 0;
  request(form?: NgForm) {
    if (this.busy()) return;
    if (form?.invalid || !this.email) {
      form?.control.markAllAsTouched();
      this.error.set('Enter a valid email address.');
      return;
    }
    if (Date.now() - this.requestedAt < 60000) {
      this.error.set('Wait one minute before requesting another code.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.http
      .post<{ message: string; requestToken: string }>('/auth/forgot-password', {
        email: this.email.trim(),
      })
      .subscribe({
        next: (result) => {
          this.requestedAt = Date.now();
          this.requestToken = result.requestToken;
          this.resetToken = '';
          this.code = '';
          this.stage.set('code');
          this.notice.set(result.message);
          this.busy.set(false);
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(errorMessage(err));
        },
      });
  }
  verify(form: NgForm) {
    if (this.busy()) return;
    if (form.invalid) {
      this.error.set('Enter the six-digit code from your email.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.http
      .post<{ resetToken: string }>('/auth/verify-reset-code', {
        requestToken: this.requestToken,
        code: this.code,
      })
      .subscribe({
        next: (result) => {
          this.resetToken = result.resetToken;
          this.requestToken = '';
          this.code = '';
          this.stage.set('password');
          this.notice.set('Email code verified. Choose a new password.');
          this.busy.set(false);
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(errorMessage(err));
        },
      });
  }
  reset(form: NgForm) {
    if (this.busy()) return;
    if (form.invalid || this.password !== this.confirmation) {
      this.error.set('Enter matching passwords of 12 to 72 characters.');
      return;
    }
    if (!this.resetToken) {
      this.restart();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.passwordReused.set(false);
    this.http
      .post<{ message: string }>('/auth/reset-password', {
        resetToken: this.resetToken,
        newPassword: this.password,
      })
      .subscribe({
        next: (result) => {
          this.resetToken = '';
          this.password = '';
          this.confirmation = '';
          this.stage.set('done');
          this.notice.set(result.message);
          this.busy.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.busy.set(false);
          this.passwordReused.set(err.error?.code === 'PASSWORD_REUSED');
          this.error.set(errorMessage(err));
        },
      });
  }
  restart() {
    this.requestToken = '';
    this.resetToken = '';
    this.code = '';
    this.password = '';
    this.confirmation = '';
    this.error.set('');
    this.notice.set('');
    this.stage.set('email');
  }
}
