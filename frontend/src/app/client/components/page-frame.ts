import { Component, input, signal, viewChild } from '@angular/core';
import { TradeDialog } from './trade-dialog';
@Component({ selector: 'app-page-frame', imports: [TradeDialog], templateUrl: './page-frame.html' })
export class PageFrame {
  readonly page = input.required<'Overview' | 'Portfolio' | 'Orders'>();
  readonly notice = signal('');
  private readonly dialog = viewChild.required(TradeDialog);
  openTrade(symbol = 'NVDA') {
    this.notice.set('');
    this.dialog().openTrade(symbol);
  }
}
