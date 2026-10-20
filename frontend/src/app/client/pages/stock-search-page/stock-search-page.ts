import { TradeDialog } from '../../components/trade-dialog/trade-dialog';
import { SearchHighlights } from '../../components/search-highlights/search-highlights';
import { StockResultCard } from '../../components/stock-result-card/stock-result-card';
import { Component, inject, signal, viewChild, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StockSearchService } from '../../../api/instruments/stock-search.service';
import { Instrument } from '../../../api/instruments/instrument';
import { Quote } from '../../../api/quotes/quote';
import { PortfolioStore } from '../../state/portfolio.store';

interface SearchResult {
  instrument: Instrument;
  quote: Quote | null;
  loading: boolean;
  error: string | null;
}

@Component({
  selector: 'app-stock-search-page',
  standalone: true,
  imports: [CommonModule, FormsModule, StockResultCard, SearchHighlights, TradeDialog],
  template: `
    <div class="stock-search-container">
      <header class="page-heading"><div>
        <p class="eyebrow">YOUR WORKSPACE</p>
        <h1>Search & Trade Stocks</h1>
        <p class="page-subtitle">Find stocks and place trades in your saved workspace.</p>
      </div></header>

      <div class="content">
        <!-- Search Section -->
        <div class="search-section">
          <div class="search-heading">
            <div class="lookup-title">
              <span class="lookup-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M4 17l5-5 4 3 7-9M15 6h5v5" /></svg>
              </span>
              <div>
                <p class="search-kicker">MARKET EXPLORER</p>
                <h2>Look up a stock</h2>
              </div>
            </div>
            <span class="market-status"><i aria-hidden="true"></i>Live catalog</span>
          </div>
          <p class="search-subtitle">Find a company or fund, check its latest quote, and start a simulated trade.</p>
          <form #searchForm="ngForm" (ngSubmit)="searchStock(searchForm)" class="search-form-wrapper">
            <label for="stock-search-input">Ticker or company</label>
            <div class="search-input-group">
              <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" />
              </svg>
              <input
                id="stock-search-input"
                type="text"
                name="symbol"
                [(ngModel)]="searchSymbol"
                placeholder="Try AAPL, Apple, or an ETF"
                aria-label="Company name or ticker search"
                aria-describedby="stock-search-help"
                class="search-input"
              />
              <button type="submit" class="search-btn" [disabled]="searching()" aria-label="Search stocks">
                @if (searching()) {
                  <span class="spinner" aria-hidden="true"></span><span class="sr-only">Searching...</span>
                } @else {
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                }
              </button>
            </div>
            <div class="search-footer" id="stock-search-help">
              <span>Search by symbol, company, or fund name</span>
              <span class="keyboard-hint"><kbd>↵</kbd> search</span>
            </div>
            @if (searchError()) {
              <p class="error-message">{{ searchError() }}</p>
            }
          </form>
          <app-search-highlights />
        </div>

        @if (companyMatches().length) {
          <div class="results-section" aria-label="Matching companies">
            @for (instrument of companyMatches(); track instrument.instrumentId) {
              <button type="button" class="secondary" (click)="lookupSymbol(instrument.symbol)">
                {{ instrument.name }} ({{ instrument.symbol }})
              </button>
            }
          </div>
        }

        <!-- Search Results -->
        @if (searchResult()) {
          <div class="results-section">
            @if (searchResult()!.loading) {
              <p class="loading">Loading stock data...</p>
            }
            @if (searchResult()!.error) {
              <p class="error">{{ searchResult()!.error }}</p>
            }
            @if (searchResult()!.instrument && !searchResult()!.loading && !searchResult()!.error) {
              <app-stock-result-card
                [instrument]="searchResult()!.instrument"
                [quote]="searchResult()!.quote"
                (trade)="openTradeDialog($event)"
              />
            }
          </div>
        }

        <app-trade-dialog #tradeDialog />
      </div>
    </div>
  `,
  styles: [`
    .stock-search-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
    }


    .content {
      display: grid;
      gap: 2rem;
    }

    .search-section {
      padding: 24px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: radial-gradient(ellipse at top right, #b3f56809, transparent 65%), var(--panel);
      box-shadow: 0 8px 24px #0002, inset 0 1px 0 #ffffff03;
    }

    .search-heading, .lookup-title { display: flex; align-items: center; }
    .search-heading { justify-content: space-between; gap: 16px; margin-bottom: 12px; }
    .lookup-title { gap: 12px; min-width: 0; }
    .lookup-mark {
      display: grid; place-items: center; flex-shrink: 0;
      width: 42px; height: 42px; border: 1px solid #425536;
      border-radius: 10px; background: var(--active); color: var(--green);
    }
    .lookup-mark svg { width: 22px; height: 22px; }
    .lookup-mark svg, .search-icon, .search-btn svg {
      fill: none; stroke: currentColor; stroke-width: 1.7;
      stroke-linecap: round; stroke-linejoin: round;
    }
    .search-kicker { margin: 0 0 2px; color: var(--green); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; }
    .search-section h2 { margin: 0; color: var(--text); font-size: 18px; font-weight: 600; letter-spacing: -0.02em; }
    .market-status {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 6px 9px; border: 1px solid var(--line); border-radius: 999px;
      color: var(--muted); font-size: 10px; white-space: nowrap;
    }
    .market-status i { width: 6px; height: 6px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 3px #b3f56815; }
    .search-subtitle { color: var(--muted); margin: 0 0 20px; font-size: 12px; line-height: 1.6; }
    .search-form-wrapper { display: flex; flex-direction: column; gap: 9px; }
    .search-form-wrapper label { color: var(--text); font-size: 12px; font-weight: 500; }
    .search-input-group {
      display: flex; align-items: center; gap: 12px; min-height: 56px;
      padding: 0 10px 0 17px; border: 1px solid var(--line);
      border-radius: 11px; background: var(--bg); box-shadow: inset 0 0 0 2px #ffffff02;
    }
    .search-input-group:focus-within { border-color: #688a49; box-shadow: 0 0 0 3px #b3f5680d; }
    .search-icon { width: 19px; height: 19px; flex-shrink: 0; color: var(--muted); }
    .search-input {
      flex: 1; width: 100%; min-width: 0; padding: 16px 0;
      border: 0; border-radius: 0; background: transparent;
      color: var(--text); font-size: 14px; box-shadow: none;
    }
    .search-input:focus { outline: none; }
    .search-input::placeholder { color: #737e80; }
    .search-btn {
      display: grid; place-items: center; width: 34px; min-width: 34px; min-height: 34px;
      padding: 7px; border: 0; border-radius: 7px; background: transparent; color: var(--muted);
    }
    .search-btn svg { width: 20px; height: 20px; }
    .search-btn:hover:not(:disabled) { color: var(--green); background: #b3f5680d; }
    .search-btn:disabled { opacity: 0.6; cursor: wait; }
    .search-footer { display: flex; justify-content: space-between; align-items: center; gap: 10px; color: var(--muted); font-size: 10px; }
    .keyboard-hint { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
    kbd { padding: 0 3px; border: 1px solid var(--line); border-radius: 4px; font: inherit; }
    @media (max-width: 540px) {
      .stock-search-container { padding: 20px 12px; }
      .search-section { padding: 20px 16px; }
      .market-status { padding: 5px 7px; font-size: 9px; }
      .search-heading { gap: 8px; }
      .lookup-title { gap: 9px; }
      .search-section h2 { font-size: 16px; }
      .keyboard-hint { display: none; }
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid var(--green);
      border-radius: 50%;
      border-top-color: transparent;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-message {
      color: #ec9292;
      background: rgba(236, 146, 146, 0.1);
      padding: 0.75rem 1rem;
      border-radius: 6px;
      border-left: 3px solid #ec9292;
      font-size: 0.9rem;
      margin: 0;
    }

    .loading {
      color: var(--muted);
      text-align: center;
      padding: 2rem;
    }

    .results-section {
      padding: 18px; border: 1px solid var(--line); border-radius: 14px;
      background: radial-gradient(ellipse at top right, #b3f56805, transparent 65%), var(--panel);
      box-shadow: 0 8px 24px #0002;
    }
    .results-section[aria-label] { display: grid; gap: 8px; }
    .results-section[aria-label] button { justify-content: flex-start; padding: 12px 14px; background: var(--bg); border: 1px solid var(--line); border-radius: 9px; text-align: left; white-space: normal; }
    .results-section[aria-label] button:hover { border-color: #688a49; background: #b3f56808; }
    .error { margin: 12px 0; color: var(--down); font-size: 12px; }

    .primary {
      background: var(--button-bg);
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
  `]
})
export class StockSearchPage {
  private readonly stockSearch = inject(StockSearchService);
  readonly portfolioStore = inject(PortfolioStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly tradeDialog = viewChild.required<TradeDialog>('tradeDialog');

  searchSymbol = '';
  companyMatches = signal<Instrument[]>([]);
  searching = signal(false);
  searchError = signal<string | null>(null);
  searchResult = signal<SearchResult | null>(null);

  searchStock(form: NgForm): void {
    if (form.invalid || !this.searchSymbol.trim()) {
      return;
    }

    const result = this.stockSearch.resolve(this.searchSymbol, this.portfolioStore.instruments());
    this.companyMatches.set(result.matches);
    this.searchError.set(result.error);
    this.searchResult.set(null);
    if (result.symbol) this.lookupSymbol(result.symbol);
  }

  lookupSymbol(symbol: string): void {
    if (this.searching()) return;
    this.companyMatches.set([]);
    this.searching.set(true);
    this.searchError.set(null);
    this.searchResult.set({ instrument: null as any, quote: null, loading: true, error: null });
    this.stockSearch.lookup(symbol).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.searchResult.set({ ...result, loading: false });
        this.searching.set(false);
      },
      error: () => {
        this.searchError.set(`Stock symbol "${symbol}" not found. Try another.`);
        this.searchResult.set(null);
        this.searching.set(false);
      },
    });
  }

  openTradeDialog(instrument: Instrument): void {
    const quote = this.searchResult()?.quote;
    if (quote) this.tradeDialog().openTrade(instrument.symbol, { instrument, quote });
  }
}
