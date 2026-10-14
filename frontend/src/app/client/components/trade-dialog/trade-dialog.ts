import { Subscription } from 'rxjs';
import { InstrumentSearch } from '../instrument-search/instrument-search';
import { Component, DestroyRef, ElementRef, inject, signal, viewChild, output } from '@angular/core';
import { CurrencyPipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { PortfolioStore, Side } from '../../state/portfolio.store';
import { ACTIVE_ACCOUNT_ID, OrderApiService } from '../../../api/orders/order-api.service';
import { QuoteApiService } from '../../../api/quotes/quote-api.service';
import { matchingInstruments } from '../../../api/instruments/instrument-search';
import { Instrument } from '../../../api/instruments/instrument';
import { Quote } from '../../../api/quotes/quote';
import { QuoteMarketCard } from '../quote-market-card/quote-market-card';

@Component({
  selector: 'app-trade-dialog',
  imports: [InstrumentSearch, QuoteMarketCard, CurrencyPipe, FormsModule, CommonModule],
  templateUrl: './trade-dialog.html',
  styles: [`
    dialog {
      width: min(560px, calc(100% - 28px));
      padding: 0;
      overflow: hidden auto;
      border-color: #343a36;
      background: var(--panel);
      box-shadow: 0 24px 64px #000a;
    }

    dialog::backdrop { background: #050705c7; backdrop-filter: blur(8px); }
    dialog.wide { width: min(820px, calc(100% - 28px)); }

    .dialog-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.4rem 1.5rem 1.2rem;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }

    .dialog-kicker { color: var(--green); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.14em; }
    .dialog-header h2 { margin: 0.25rem 0 0.18rem; color: var(--text); font-size: 1.35rem; font-weight: 600; letter-spacing: -0.025em; }
    .dialog-header p { font-size: 0.76rem; }
    .dialog-body { padding: 1.35rem 1.5rem 1.5rem; }

    .close-button {
      width: 34px;
      min-height: 34px;
      padding: 8px;
      border-radius: 9px;
      color: var(--muted);
    }

    .close-button svg, .back-button svg {
      width: 100%;
      height: 100%;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .stage-copy { margin-bottom: 1rem; }
    .stage-copy h3 { margin-bottom: 0.25rem; color: var(--text); font-size: 0.95rem; font-weight: 600; }
    .stage-copy p { font-size: 0.78rem; }

    .asset-selector {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .asset-selector select {
      flex: 1;
    }

    .search-btn {
      width: 40px;
      min-height: 40px;
      padding: 9px;
      cursor: pointer;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--panel);
      color: var(--muted);
      transition: all 0.2s;
    }

    .search-btn:hover {
      border-color: var(--green);
      background: var(--active);
      color: var(--green);
    }

    .search-btn svg {
      width: 100%;
      height: 100%;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
    }

    app-quote-market-card { margin-top: 1rem; }
    .edit-layout.with-quote {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
      gap: 1rem;
      align-items: start;
    }

    .selected-quote { display: block; min-width: 0; margin: 0; }
    .review-quote { text-align: left; }

    .order-ticket {
      min-width: 0;
      padding: 1rem;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel);
    }

    .edit-layout:not(.with-quote) .order-ticket { padding: 0; border: 0; background: transparent; box-shadow: none; }

    .ticket-heading { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 1rem; }
    .ticket-heading div { display: grid; gap: 0.12rem; }
    .ticket-heading div span { color: var(--green); font-size: 0.58rem; font-weight: 700; letter-spacing: 0.12em; }
    .ticket-heading strong { color: var(--text); font-size: 0.92rem; }
    .market-order { padding: 0.28rem 0.5rem; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 0.65rem; }

    .side-switch {
      margin: 0 0 1rem;
      padding: 4px;
      border: 1px solid var(--line);
      border-radius: 9px;
      background: var(--bg);
    }

    .side-switch button { border: 0; border-radius: 6px; }
    .order-summary { margin-top: 1.2rem; padding: 0 1rem; border: 1px solid var(--line); border-radius: 10px; background: #0c0e1080; }
    .summary-row { padding: 0.8rem 0; font-size: 0.82rem; }
    .total-row { border-bottom: 0; }
    .total-row strong { color: var(--green); font-size: 0.95rem; }

    .inline-error {
      margin-top: 0.85rem;
      padding: 0.7rem 0.8rem;
      border: 1px solid #ec929233;
      border-radius: 8px;
      background: #ec92920a;
      color: var(--down);
      font-size: 0.76rem;
    }

    .inline-error:empty { display: none; }
    .submit-button { min-height: 42px; font-weight: 700; }
    .back-button { gap: 0.35rem; border-color: transparent; color: var(--muted); }
    .back-button svg { width: 16px; height: 16px; }

    .review-stage { text-align: center; }
    .review-icon { display: grid; width: 48px; height: 48px; margin: 0 auto; place-items: center; border: 1px solid #b3f56835; border-radius: 50%; background: #b3f5680d; color: var(--green); font-size: 1.25rem; }
    .review-title { margin: 0.8rem 0 0.2rem; }
    .review-summary { text-align: left; }
    .review-note { margin-top: 0.9rem; font-size: 0.72rem; }

    @media (max-width: 520px) {
      .dialog-header, .dialog-body { padding-inline: 1rem; }
    }

    @media (max-width: 760px) {
      dialog.wide { width: min(540px, calc(100% - 20px)); }
      .edit-layout.with-quote { grid-template-columns: 1fr; }
    }
  `]
})
export class TradeDialog {
  readonly store = inject(PortfolioStore);
  private readonly ordersApi = inject(OrderApiService);
  private readonly accountId = inject(ACTIVE_ACCOUNT_ID);
  private readonly quoteApi = inject(QuoteApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('tradeDialog');
  readonly stage = signal<'edit' | 'review' | 'search'>('edit');
  readonly error = signal('');
  readonly submitting = signal(false);
  readonly filled = output<void>();

  // Search state
  loadingQuote = signal(false);
  searchError = signal<string | null>(null);
  searchResult = signal<{ instrument: Instrument; quote: Quote | null } | null>(null);

  // Persistent stock info (used for searched stocks)
  selectedStockInfo = signal<{ instrument: Instrument; quote: Quote | null } | null>(null);

  symbol = 'AAPL';
  side: Side = 'buy';
  quantity = 1;

  get asset() {
    // First check if there's a selected stock from search
    const selectedStock = this.selectedStockInfo();
    if (selectedStock) {
      return {
        symbol: selectedStock.instrument.symbol,
        name: selectedStock.instrument.name,
        price: selectedStock.quote?.price ?? 0,
        change: selectedStock.quote?.changePercent ?? 0,
        shares: this.store.assets().find(a => a.symbol === this.symbol)?.shares ?? 0,
        cost: selectedStock.quote?.price ?? 0,
        instrumentId: selectedStock.instrument.instrumentId
      };
    }
    // Otherwise look for it in the store
    return this.store.assets().find((a) => a.symbol === this.symbol)!;
  }

  get orderTotal() {
    const asset = this.asset;
    if (!asset) return 0;
    return asset.price * (Number.isFinite(this.quantity) ? this.quantity : 0);
  }

  openTrade(symbol = 'AAPL') {
    this.symbol = symbol;
    this.side = 'buy';
    this.quantity = 1;
    this.stage.set('edit');
    this.error.set('');
    this.searchResult.set(null);
    this.selectedStockInfo.set(null);
    this.searchError.set(null);

    this.dialog().nativeElement.showModal();
    const instrument = this.store.instruments().find(value => value.symbol === symbol);
    if (instrument) this.quoteApi.getQuote(symbol).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: quote => this.selectedStockInfo.set({ instrument, quote }),
      error: () => this.error.set('Unable to load the current price. Please try again.'),
    });
  }

  openSearch() {
    this.stage.set('search');
    this.searchResult.set(null);
    this.searchError.set(null);
  }

  private quoteRequest?: Subscription;

  loadInstrument(instrument: Instrument): void {
    this.quoteRequest?.unsubscribe();
    this.searchError.set(null);
    this.searchResult.set({ instrument, quote: null });
    this.loadingQuote.set(true);
    this.quoteRequest = this.quoteApi.getQuote(instrument.symbol).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: quote => { this.searchResult.set({ instrument, quote }); this.loadingQuote.set(false); },
      error: () => { this.searchError.set('Unable to load stock price. Please try again.'); this.loadingQuote.set(false); },
    });
  }

  selectSearchedStock(): void {
    const result = this.searchResult();
    if (result && result.instrument) {
      // Check if we have a quote with price
      if (!result.quote || !result.quote.price) {
        this.searchError.set('Unable to load stock price. Please try again.');
        return;
      }
      this.symbol = result.instrument.symbol;
      this.selectedStockInfo.set(result); // Persist the stock info
      this.stage.set('edit');
      this.searchResult.set(null); // Clear search result
    }
  }

  backToEdit() {
    this.stage.set('edit');
  }

  review() {
    const selectedStock = this.selectedStockInfo();
    const price = selectedStock?.quote?.price;
    this.error.set(this.store.validate(this.symbol, this.side, this.quantity, price));
    if (!this.error()) this.stage.set('review');
  }

  confirm() {
    if (!this.store.accountId()) { this.error.set('Your account is still loading. Please try again.'); return; }
    if (this.stage() !== 'review' || this.submitting()) return;
    const price = this.selectedStockInfo()?.quote?.price;
    const validationError = this.store.validate(this.symbol, this.side, this.quantity, price);
    if (validationError) {
      this.error.set(validationError);
      this.stage.set('edit');
      return;
    }

    this.submitting.set(true);
    this.error.set('');
    this.ordersApi.createOrder({
        accountId: this.store.accountId()!,
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
        this.store.requestRefresh();
        this.submitting.set(false);
        this.stage.set('edit');
        this.selectedStockInfo.set(null);
        this.dialog().nativeElement.close();
        this.filled.emit();
      },
      error: (err) => {
        this.submitting.set(false);
        this.error.set(err.error?.detail || 'Unable to place the order. Please try again.');
      },
    });
  }
}
