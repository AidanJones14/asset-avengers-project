import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService, ProfileDetails } from '../../../auth/auth.service';
import { errorMessage } from '../../../auth/api-error';
import { ThemeService } from '../../../shared/theme/theme.service';
import { PageFrame } from '../../components/page-frame/page-frame';

@Component({ selector: 'app-profile-page', imports: [FormsModule, PageFrame], templateUrl: './profile-page.html', styleUrl: './profile-page.css' })
export class ProfilePage {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly selectedTheme = signal<'light' | 'dark'>(this.theme.mode());
  readonly appearanceMessage = signal('');
  readonly appearanceError = signal('');
  private readonly destroyRef = inject(DestroyRef);
  readonly details = signal<ProfileDetails | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly passwordSaving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly passwordError = signal('');
  firstName = ''; lastName = '';
  currentPassword = ''; newPassword = ''; confirmation = '';
  constructor() { this.load(); }
  load() {
    this.loading.set(true); this.error.set('');
    this.auth.getProfile().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: profile => { this.details.set(profile); this.firstName = profile.firstName; this.lastName = profile.lastName; this.loading.set(false); },
      error: error => { this.loading.set(false); this.error.set(errorMessage(error)); },
    });
  }
  save(form: NgForm) {
    if (this.saving() || this.passwordSaving()) return;
    this.success.set(''); this.error.set('');
    if (form.invalid || !this.firstName.trim() || !this.lastName.trim()) { form.control.markAllAsTouched(); this.error.set('Enter your first and last name.'); return; }
    this.saving.set(true);
    this.auth.updateProfile(this.firstName.trim(), this.lastName.trim()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: profile => { this.details.set(profile); this.saving.set(false); this.success.set('Your profile has been updated.'); },
      error: error => { this.saving.set(false); this.error.set(errorMessage(error)); },
    });
  }
  savePassword(form: NgForm) {
    if (this.passwordSaving() || this.saving()) return;
    this.passwordError.set('');
    if (form.invalid || this.newPassword !== this.confirmation) { form.control.markAllAsTouched(); this.passwordError.set('Enter your current password and matching new passwords (12–72 characters).'); return; }
    this.passwordSaving.set(true);
    this.auth.changePassword(this.currentPassword, this.newPassword).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.currentPassword = ''; this.newPassword = ''; this.confirmation = ''; this.passwordSaving.set(false); },
      error: error => { this.passwordSaving.set(false); this.passwordError.set(errorMessage(error)); },
    });
  }
  chooseTheme(mode: 'light' | 'dark') {
    this.selectedTheme.set(mode); this.theme.preview(mode); this.appearanceMessage.set(''); this.appearanceError.set('');
  }
  saveAppearance() {
    this.appearanceMessage.set(''); this.appearanceError.set('');
    if (this.theme.savePreference(this.selectedTheme()))
      this.appearanceMessage.set('Appearance saved for future visits on this browser.');
    else this.appearanceError.set('Unable to save your appearance. Allow browser storage and try again.');
  }
}
