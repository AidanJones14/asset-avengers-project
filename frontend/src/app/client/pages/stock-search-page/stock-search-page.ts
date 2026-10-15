import { Subscription } from 'rxjs';
import { InstrumentSearch } from '../../components/instrument-search/instrument-search';
import { Component, inject, signal, viewChild, ElementRef, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { QuoteApiService } from '../../../api/quotes/quote-api.service';
import { OrderApiService } from '../../../api/orders/order-api.service';
import { Instrument } from '../../../api/instruments/instrument';
import { Quote } from '../../../api/quotes/quote';
import { PortfolioStore } from '../../state/portfolio.store';
import { QuoteMarketCard } from '../../components/quote-market-card/quote-market-card';

interface SearchResult {
  instrument: Instrument;
  quote: Quote | null;
  loading: boolean;
  error: string | null;
}

@Component({
  selector: 'app-stock-search-page',
  standalone: true,
  imports: [InstrumentSearch, QuoteMarketCard, CommonModule, FormsModule, CurrencyPipe],
  template: `
    <div class="stock-search-container">
      <h1>Search & Trade Stocks</h1>

      <div class="content">
        <!-- Search Section -->
        <div class="search-section">
          <div class="search-heading">
            <div class="lookup-title">
              <span class="lookup-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 17l5-5 4 3 7-9" />
                  <path d="M15 6h5v5" />
                </svg>
              </span>
              <div>
                <p class="search-kicker">MARKET EXPLORER</p>
                <h2>Look up a stock</h2>
              </div>
            </div>
            <span class="market-status"><i></i> Live catalog</span>
          </div>
          <p class="search-subtitle">Find a company or fund, check its latest quote, and start a simulated trade.</p>
          <app-instrument-search (selected)="loadInstrument($event)" />
          <div class="search-examples" aria-hidden="true">
            <span>Popular searches</span>
            <strong>AAPL</strong>
            <strong>MSFT</strong>
            <strong>SPY</strong>
          </div>
        </div>

        <!-- Search Results -->
        @if (searchResult()) {
          <div class="results-section">
            @if (searchResult()!.error) {
              <p class="error">{{ searchResult()!.error }}</p>
            } @else {
              <app-quote-market-card
                [symbol]="searchResult()!.instrument.symbol"
                [name]="searchResult()!.instrument.name"
                [quote]="searchResult()!.quote"
                [loading]="searchResult()!.loading"
                [actionLabel]="searchResult()!.loading ? '' : 'Trade ' + searchResult()!.instrument.symbol"
                (action)="openTradeDialog(searchResult()!.instrument)"
              />
            }
          </div>
        }

        <!-- Trade Dialog -->
        <dialog #tradeDialog class="trade-dialog" aria-labelledby="trade-title">
          <div class="dialog-content">
            <div class="dialog-heading">
              <div>
                <span class="dialog-kicker">SIMULATED ORDER</span>
                <h3 id="trade-title">Trade {{ selectedInstrument()?.symbol }}</h3>
                <p>No real money or orders</p>
              </div>
              <button type="button" class="dialog-close" (click)="closeTradeDialog()" aria-label="Close trade dialog">×</button>
            </div>

            <div class="trade-layout">
              @if (selectedInstrument() && selectedQuote()) {
                <app-quote-market-card
                  class="dialog-quote"
                  [symbol]="selectedInstrument()!.symbol"
                  [name]="selectedInstrument()!.name"
                  [quote]="selectedQuote()"
                  [compact]="true"
                />
              }

              <form class="order-ticket" #tradeForm="ngForm" (ngSubmit)="submitTrade(tradeForm)">
              <div class="ticket-heading">
                <div><span>ORDER DETAILS</span><strong>Build your trade</strong></div>
                <span class="market-order">Market</span>
              </div>
              <div class="side-selector" role="group" aria-label="Order side">
                <button type="button" [class.active]="tradeData.side === 'buy'" (click)="tradeData.side = 'buy'">Buy</button>
                <button type="button" [class.active]="tradeData.side === 'sell'" (click)="tradeData.side = 'sell'">Sell</button>
              </div>

              <div class="form-group">
                <label for="quantity">Shares</label>
                <input
                  id="quantity"
                  type="number"
                  name="quantity"
                  [(ngModel)]="tradeData.quantity"
                  min="1"
                  step="1"
                  required
                  placeholder="1"
                />
              </div>

              @if (selectedInstrument() && selectedQuote()) {
                <div class="order-summary">
                  <div class="summary-row">
                    <span>Price per share</span>
                    <strong>{{ selectedQuote()!.price | currency }}</strong>
                  </div>
                  <div class="summary-row total-row">
                    <span>Order total</span>
                    <strong>{{ getOrderTotal() | currency }}</strong>
                  </div>
                  <div class="summary-row">
                    <span>{{ tradeData.side === 'buy' ? 'Cash Available to Trade' : 'Shares held' }}</span>
                    <strong>
                      @if (tradeData.side === 'buy') {
                        {{ portfolioStore.cash() | currency }}
                      } @else {
                        {{ getSharesHeld() }}
                      }
                    </strong>
                  </div>
                </div>
              }

              @if (tradeError()) {
                <p class="error">{{ tradeError() }}</p>
              }

              <div class="dialog-actions">
                <button type="button" class="secondary" (click)="closeTradeDialog()">
                  Cancel
                </button>
                <button type="submit" class="primary" [disabled]="tradeLoading()">
                  {{ tradeLoading() ? 'Processing...' : 'Confirm Trade' }}
                </button>
              </div>
              </form>
            </div>
          </div>
        </dialog>
      </div>
    </div>
  `,
  styles: [`
    .stock-search-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
    }

    h1 {
      margin-bottom: 2rem;
      font-size: 1.8rem;
      color: var(--text);
    }

    .content {
      display: grid;
      gap: 2rem;
    }

    .search-section {
      position: relative;
      background:
        radial-gradient(circle at 92% -30%, #b3f56816, transparent 42%),
        var(--panel);
      padding: 1.75rem;
      border-radius: 12px;
      border: 1px solid var(--line);
      box-shadow: 0 12px 32px #0003, inset 0 1px 0 #ffffff06;
    }

    .search-heading,
    .lookup-title {
      display: flex;
      align-items: center;
    }

    .search-heading {
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 0.75rem;
    }

    .lookup-title {
      gap: 0.85rem;
    }

    .lookup-mark {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      flex-shrink: 0;
      border: 1px solid #425536;
      border-radius: 10px;
      background: #1a2217;
      color: var(--green);
    }

    .lookup-mark svg {
      width: 21px;
      height: 21px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .search-kicker {
      margin-bottom: 2px;
      color: var(--green);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.12em;
    }

    .search-section h2 {
      color: var(--text);
      font-size: 1.25rem;
      letter-spacing: -0.02em;
    }

    .market-status {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 6px 9px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      font-size: 11px;
      white-space: nowrap;
    }

    .market-status i {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 0 3px #b3f56815;
    }

    .search-subtitle {
      color: var(--muted);
      margin-bottom: 1.25rem;
      font-size: 0.9rem;
    }

    .search-examples {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 17px;
      color: var(--muted);
      font-size: 10px;
    }

    .search-examples strong {
      padding: 3px 7px;
      border: 1px solid #303639;
      border-radius: 5px;
      color: #b6bdb9;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.04em;
    }

    .results-section {
      min-width: 0;
    }

    .trade-dialog {
      width: min(820px, calc(100% - 28px));
      padding: 0;
      overflow-x: hidden;
      overflow-y: auto;
      border: 1px solid #343a36;
      border-radius: 14px;
      background: var(--panel);
      box-shadow: 0 24px 64px #000a;
    }

    .trade-dialog::backdrop {
      background: #050705c7;
      backdrop-filter: blur(8px);
    }

    .dialog-content { padding: 0; }

    .dialog-heading {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.35rem 1.5rem 1.15rem;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }

    .dialog-kicker { color: var(--green); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.14em; }

    .dialog-content h3 {
      margin: 0.2rem 0;
      color: var(--text);
      font-size: 1.35rem;
      font-weight: 600;
      letter-spacing: -0.025em;
    }

    .dialog-heading p { font-size: 0.76rem; }

    .dialog-close {
      width: 34px;
      min-height: 34px;
      padding: 0;
      border-radius: 9px;
      color: var(--muted);
      font-size: 1.35rem;
    }

    .trade-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
      gap: 1rem;
      align-items: start;
      padding: 1rem;
    }

    .dialog-quote { display: block; min-width: 0; }

    .order-ticket {
      min-width: 0;
      padding: 1rem;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel);
    }

    .ticket-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .ticket-heading div { display: grid; gap: 0.12rem; }
    .ticket-heading div span { color: var(--green); font-size: 0.58rem; font-weight: 700; letter-spacing: 0.12em; }
    .ticket-heading strong { color: var(--text); font-size: 0.92rem; }
    .market-order { padding: 0.28rem 0.5rem; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 0.65rem; }

    .side-selector {
      display: flex;
      gap: 4px;
      margin: 0 0 1rem;
      padding: 4px;
      border: 1px solid var(--line);
      border-radius: 9px;
      background: var(--bg);
    }

    .side-selector button { flex: 1; border: 0; border-radius: 6px; }
    .side-selector button.active { background: var(--green); color: #16200e; font-weight: 700; }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: var(--text);
    }

    .form-group input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--line);
      border-radius: 4px;
      font-size: 1rem;
      background: var(--bg);
      color: var(--text);
    }

    .form-group input:focus {
      outline: none;
      border-color: var(--green);
      box-shadow: 0 0 0 3px rgba(179, 245, 104, 0.1);
    }

    .order-summary {
      background: #0c0e1080;
      padding: 0 1rem;
      border-radius: 10px;
      margin-bottom: 1rem;
      border: 1px solid var(--line);
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      margin: 0;
      padding: 0.8rem 0;
      border-bottom: 1px solid var(--line);
      font-size: 0.82rem;
      color: var(--muted);
    }

    .summary-row strong {
      font-weight: 600;
      color: var(--text);
    }

    .summary-row:last-child { border-bottom: 0; }
    .total-row strong { color: var(--green); font-size: 0.95rem; }

    .dialog-actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1rem;
      justify-content: flex-end;
    }

    .dialog-actions button {
      flex: 1;
      min-height: 42px;
      padding: 0.5rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .primary {
      background: var(--green);
      color: #0c0e10;
    }

    .primary:hover:not(:disabled) {
      background: #a8e85a;
    }

    .secondary {
      background-color: var(--line);
      color: var(--text);
    }

    .secondary:hover {
      background-color: var(--active);
    }

    @media (max-width: 760px) {
      .trade-layout { grid-template-columns: 1fr; }
      .trade-dialog { width: min(540px, calc(100% - 20px)); }
    }
  `]
})
export class StockSearchPage {
  private readonly ordersApi = inject(OrderApiService);
  private readonly quoteApi = inject(QuoteApiService);
  readonly portfolioStore = inject(PortfolioStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly tradeDialog = viewChild.required<ElementRef<HTMLDialogElement>>('tradeDialog');

  searching = signal(false);
  searchError = signal<string | null>(null);
  searchResult = signal<SearchResult | null>(null);

  selectedInstrument = signal<Instrument | null>(null);
  selectedQuote = signal<Quote | null>(null);
  tradeLoading = signal(false);
  tradeError = signal<string | null>(null);

  tradeData = {
    side: 'buy' as 'buy' | 'sell',
    quantity: 1
  };

  private quoteRequest?: Subscription;

  loadInstrument(instrument: Instrument): void {
    this.quoteRequest?.unsubscribe();
    this.searching.set(true);
    this.searchError.set(null);
    this.searchResult.set({ instrument, quote: null, loading: true, error: null });
    this.quoteRequest = this.quoteApi.getQuote(instrument.symbol).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: quote => { this.searchResult.set({ instrument, quote, loading: false, error: null }); this.searching.set(false); },
      error: () => { this.searchResult.set({ instrument, quote: null, loading: false, error: 'Unable to load stock price. Please try again.' }); this.searching.set(false); },
    });
  }

  openTradeDialog(instrument: Instrument): void {
    if (!this.searchResult()?.quote) return;

    this.selectedInstrument.set(instrument);
    this.selectedQuote.set(this.searchResult()!.quote);
    this.tradeData.side = 'buy';
    this.tradeData.quantity = 1;
    this.tradeError.set(null);

    this.tradeDialog().nativeElement.showModal();
  }

  closeTradeDialog(): void {
    this.tradeDialog().nativeElement.close();
  }

  getOrderTotal(): number {
    if (!this.selectedQuote()) return 0;
    return this.selectedQuote()!.price * this.tradeData.quantity;
  }

  getSharesHeld(): number {
    if (!this.selectedInstrument()) return 0;
    const asset = this.portfolioStore.assets().find(a => a.symbol === this.selectedInstrument()!.symbol);
    return asset?.shares || 0;
  }

  submitTrade(form: NgForm): void {
    if (form.invalid || !this.selectedInstrument() || !this.selectedQuote()) {
      return;
    }

    const symbol = this.selectedInstrument()!.symbol;
    const error = this.portfolioStore.validate(symbol, this.tradeData.side, this.tradeData.quantity);

    if (error) {
      this.tradeError.set(error);
      return;
    }

    this.tradeLoading.set(true);
    this.tradeError.set(null);

    const accountId = this.portfolioStore.accountId();
    if (!accountId) { this.tradeLoading.set(false); this.tradeError.set('Your account is still loading.'); return; }
    this.ordersApi.createOrder({ accountId, symbol, orderType: 'market', orderSide: this.tradeData.side,
      quantity: this.tradeData.quantity, limitPrice: null, stopPrice: null,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.tradeLoading.set(false); this.portfolioStore.requestRefresh(); this.closeTradeDialog(); },
      error: err => { this.tradeLoading.set(false); this.tradeError.set(err.error?.detail || 'Unable to submit order'); },
    });
  }
}
