import { ApiOrder } from '../../../api/orders/order';
import { AccountApiService } from '../../../api/accounts/account-api.service';
import { Component, computed, effect, DestroyRef, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Order } from '../../state/portfolio.store';
import { PolishedSelect } from '../../../shared/directives/polished-select';

interface Dispute {
  disputeId: string; orderId: string | null; category: string; description: string;
  status: string; createdAt: string; accountId?: string;
}
@Component({
  selector: 'app-dispute-form', imports: [FormsModule, DatePipe, PolishedSelect],
  templateUrl: './dispute-form.html', styleUrl: './dispute-form.css',
})
export class DisputeForm {
  readonly orders = input.required<Order[]>();
  readonly accountId = input<string | null>(null);
  readonly instruments = input<{instrumentId:string;symbol:string}[]>([]);
  readonly relatedOrdersError = signal('');
  private readonly loadedOrders = signal<Order[]>([]);
  private ordersVersion = 0;
  private readonly accountApi = inject(AccountApiService);
  readonly investmentAccounts = this.accountApi.accounts;
  readonly selectedAccountId = signal('');
  readonly accountsError = signal('');
  readonly availableOrders = computed(() =>
    (this.selectedAccountId()===this.accountId() ? this.orders() : this.loadedOrders()).filter(order =>
      (order.accountId || this.accountId()) === this.selectedAccountId()));
  selectAccount(id: string) {
    this.selectedAccountId.set(id); this.orderId=''; this.relatedOrdersError.set('');
    this.loadedOrders.set([]);const version=++this.ordersVersion;
    if (id===this.accountId() || !this.investmentAccounts().some(a=>a.accountId===id)) return;
    // Read only this investment account's orders; no provider quote request is made.
    this.http.get<ApiOrder[]>('/api/v1/orders',{params:{accountId:id}}).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next:rows=>{
        if (version!==this.ordersVersion) return;
        this.loadedOrders.set(rows.map(row=>({id:row.orderId,accountId:row.accountId,
          symbol:this.instruments().find(i=>i.instrumentId===row.instrumentId)?.symbol || 'Investment',
          side:row.orderSide,quantity:row.quantity,total:row.price==null?null:row.price*row.quantity,
          status:row.status,submittedAt:row.submittedAt})));
      },
      error:()=>{ if(version===this.ordersVersion) this.relatedOrdersError.set('Could not load related orders. Retry or file without a related order.'); },
    });
  }
  investmentAccountLabel(id?: string) {
    const account=this.investmentAccounts().find(a=>a.accountId===id);
    return account ? `${account.accountName} · ${account.accountType}` : 'Investment account unavailable';
  }
  loadAccounts() {
    this.accountsError.set('');
    this.accountApi.getAccounts().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      error: () => this.accountsError.set('Could not load your investment accounts. Please retry.'),
    });
  }
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
  constructor() {
    this.load(); this.loadAccounts();
    effect(() => {
      if (!this.selectedAccountId()) {
        const active=this.accountId();
        const accounts=this.investmentAccounts();
        if (active && accounts.some(a=>a.accountId===active)) this.selectedAccountId.set(active);
        else if (accounts.length===1) this.selectedAccountId.set(accounts[0].accountId);
      }
    });
  }
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
    if (!this.investmentAccounts().some(a=>a.accountId===this.selectedAccountId())) {
      this.error.set('Select the investment account affected by this dispute.'); return;
    }
    this.pending.set(true); this.error.set('');
    this.http.post<Dispute>('/api/v1/me/disputes', {
      // The server verifies this account and any related order against the authenticated owner.
      accountId: this.selectedAccountId(),
      orderId: this.orderId || null, category: this.category, description: this.description.trim(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: dispute => {
        this.disputes.update(rows => [dispute, ...rows].slice(0, 50));
        this.confirmation.set(`Dispute submitted. Reference: ${dispute.disputeId}`);
        this.pending.set(false);
        form.resetForm({ investmentAccountId: this.selectedAccountId(), orderId: '', category: '', description: '' });
      },
      error: () => { this.pending.set(false); this.error.set('Unable to submit your dispute. Your details have been kept; please try again.'); },
    });
  }
}
