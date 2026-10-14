import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Quote } from './quote';

/** Override in application providers when the API is hosted at another origin. */
export const QUOTE_API_URL = new InjectionToken<string>('QUOTE_API_URL', {
  providedIn: 'root',
  factory: () => '/api/v1/orders',
});

@Injectable({ providedIn: 'root' })
export class QuoteApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(QUOTE_API_URL).replace(/\/+$/, '');

  /**
   * Get a stock quote for the given instrument ID.
   * @param instrumentId The ID of the instrument to quote
   * @returns Observable<Quote> containing the latest quote data
   */
  getQuoteByInstrumentId(instrumentId: string): Observable<Quote> {
    return this.http.get<Quote>(`${this.baseUrl}/quote/${encodeURIComponent(instrumentId)}`);
  }

  /**
   * Get a stock quote for the given symbol.
   * @param symbol The stock symbol (e.g., AAPL, TSLA, VOO)
   * @returns Observable<Quote> containing the latest quote data
   */
  getQuote(symbol: string): Observable<Quote> {
    return this.http.get<Quote>(`${this.baseUrl}/quote/symbol/${encodeURIComponent(symbol.toUpperCase())}`);
  }
}
