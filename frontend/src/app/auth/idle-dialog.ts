import { Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { AuthService } from './auth.service';
import { IdleService } from './idle.service';

/** The "Still there?" dialog. Lives in app.html so it works on every page. */
@Component({
  selector: 'app-idle-dialog',
  template: `
    <dialog #dialog aria-labelledby="idle-title" (cancel)="$event.preventDefault()">
      <div class="panel-heading">
        <h2 id="idle-title">Still there?</h2>
      </div>
      <p role="timer" aria-live="polite">
        For your security, you'll be logged out in {{ countdown() }}.
      </p>
      <button type="button" class="primary full" (click)="idle.stay()">Stay logged in</button>
      <button type="button" class="full" (click)="auth.logout()">Log out now</button>
    </dialog>
  `,
})
export class IdleDialog {
  readonly idle = inject(IdleService);
  readonly auth = inject(AuthService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly countdown = computed(() => {
    const seconds = Math.ceil(this.idle.remainingMs() / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });

  constructor() {
    // Open and close the native dialog to match the service's state.
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.idle.warning() && !el.open) el.showModal();
      if (!this.idle.warning() && el.open) el.close();
    });
  }
}
