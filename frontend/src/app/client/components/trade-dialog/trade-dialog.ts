import { Component, DestroyRef, ElementRef, inject, signal, viewChild, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { PortfolioStore, Side } from '../../state/portfolio.store';
import { ACTIVE_ACCOUNT_ID, OrderApiService } from '../../../api/orders/order-api.service';

@Component({
  selector: 'app-trade-dialog',
  imports: [CurrencyPipe, FormsModule],
  templateUrl: './trade-dialog.html',
})
export class TradeDialog {
  readonly store = inject(PortfolioStore);
  private readonly ordersApi = inject(OrderApiService);
  private readonly accountId = inject(ACTIVE_ACCOUNT_ID);
  private readonly destroyRef = inject(DestroyRef);

  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('tradeDialog');
  readonly stage = signal<'edit' | 'review'>('edit');
  readonly error = signal('');
  readonly submitting = signal(false);
  readonly filled = output<void>();
  symbol = 'AAPL';
  side: Side = 'buy';
  quantity = 1;
  get asset() {
    return this.store.assets().find((a) => a.symbol === this.symbol)!;
  }
  get orderTotal() {
    return this.asset.price * (Number.isFinite(this.quantity) ? this.quantity : 0);
  }
  openTrade(symbol = 'AAPL') {
    this.symbol = symbol;
    this.side = 'buy';
    this.quantity = 1;
    this.stage.set('edit');
    this.error.set('');

    this.dialog().nativeElement.showModal();
  }
  review() {
    this.error.set(this.store.validate(this.symbol, this.side, this.quantity));
    if (!this.error()) this.stage.set('review');
  }
  confirm() {
    if (this.stage() !== 'review' || this.submitting()) return;
    const validationError = this.store.validate(this.symbol, this.side, this.quantity);
    if (validationError) {
      this.error.set(validationError);
      this.stage.set('edit');
      return;
    }

    this.submitting.set(true);
    this.error.set('');
    this.ordersApi.createOrder({
        accountId: this.accountId,
        symbol: this.symbol,
        orderType: 'market',
        orderSide: this.side,
        quantity: this.quantity,
        limitPrice: null,
        stopPrice: null,
      }).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: order => {
        this.store.addOrder({
          id: order.orderId,
          symbol: this.symbol,
          side: order.orderSide,
          quantity: order.quantity,
          total: order.price != null ? order.quantity * order.price : null,
          status: order.status,
        });
        this.submitting.set(false);
        this.stage.set('edit');
        this.dialog().nativeElement.close();
        this.filled.emit();
      },
      error: () => {
        this.submitting.set(false);
        this.error.set('Unable to place the order. Please try again.');
      },
    });
  }
}
