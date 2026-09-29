import { Component, ElementRef, inject, signal, viewChild, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { PortfolioStore, Side } from '../../portfolio.store';

@Component({
  selector: 'app-trade-dialog',
  imports: [CurrencyPipe, FormsModule],
  templateUrl: './trade-dialog.html',
})
export class TradeDialog {
  readonly store = inject(PortfolioStore);

  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('tradeDialog');
  readonly stage = signal<'edit' | 'review'>('edit');
  readonly error = signal('');
  readonly filled = output<void>();
  symbol = 'NVDA';
  side: Side = 'buy';
  quantity = 1;
  get asset() {
    return this.store.assets().find((a) => a.symbol === this.symbol)!;
  }
  get orderTotal() {
    return this.asset.price * (Number.isFinite(this.quantity) ? this.quantity : 0);
  }
  openTrade(symbol = 'NVDA') {
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
    if (this.stage() !== 'review') return;
    this.error.set(this.store.trade(this.symbol, this.side, this.quantity));
    if (this.error()) {
      this.stage.set('edit');
      return;
    }
    this.stage.set('edit');
    this.dialog().nativeElement.close();
    this.filled.emit();
  }
}
