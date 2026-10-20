import { Component, DestroyRef, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Order } from '../../state/portfolio.store';

interface Dispute {
  disputeId: string; orderId: string | null; category: string; description: string;
  status: string; createdAt: string;
}
@Component({
  selector: 'app-dispute-form', imports: [FormsModule, DatePipe],
  templateUrl: './dispute-form.html', styleUrl: './dispute-form.css',
})
export class DisputeForm {
  readonly orders = input.required<Order[]>();
  private readonly details = viewChild.required<ElementRef<HTMLDetailsElement>>('disputeDetails');
  open() {
    const details = this.details().nativeElement;
    details.open = true;
    details.scrollIntoView({ block: 'start' });
    details.querySelector<HTMLSelectElement>('select')?.focus({ preventScroll: true });
  }
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly disputes = signal<Dispute[]>([]);
  readonly pending = signal(false);
  readonly error = signal('');
  readonly historyError = signal('');
  readonly confirmation = signal('');
  orderId = '';
  category = '';
  description = '';
  constructor() { this.load(); }
  load() {
    this.historyError.set('');
    this.http.get<Dispute[]>('/api/v1/me/disputes').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: rows => this.disputes.set(rows),
      error: () => this.historyError.set('Could not load your recent disputes.'),
    });
  }
  submit(form: NgForm) {
    if (this.pending()) return;
    this.confirmation.set('');
    if (form.invalid || this.description.trim().length < 20) {
      this.error.set('Choose a reason and describe the issue in at least 20 characters.'); return;
    }
    this.pending.set(true); this.error.set('');
    this.http.post<Dispute>('/api/v1/me/disputes', {
      orderId: this.orderId || null, category: this.category, description: this.description.trim(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: dispute => {
        this.disputes.update(rows => [dispute, ...rows].slice(0, 50));
        this.confirmation.set(`Dispute submitted. Reference: ${dispute.disputeId}`);
        this.pending.set(false);
        form.resetForm({ orderId: '', category: '', description: '' });
      },
      error: () => { this.pending.set(false); this.error.set('Unable to submit your dispute. Your details have been kept; please try again.'); },
    });
  }
}
