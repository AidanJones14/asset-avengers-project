import { inject, Injectable } from '@angular/core';
import { catchError, map, of, switchMap } from 'rxjs';
import { Instrument } from './instrument';
import { InstrumentApiService } from './instrument-api.service';
import { matchingInstruments } from './instrument-search';
import { QuoteApiService } from '../quotes/quote-api.service';

@Injectable({ providedIn: 'root' })
export class StockSearchService {
  private readonly instruments = inject(InstrumentApiService);
  private readonly quotes = inject(QuoteApiService);

  resolve(query: string, instruments: Instrument[]): { matches: Instrument[]; symbol: string | null; error: string | null } {
    const value = query.trim();
    if (!value) return { matches: [], symbol: null, error: null };
    const matches = matchingInstruments(instruments, value);
    const exact = matches.find(instrument => instrument.symbol.toUpperCase() === value.toUpperCase());
    if (exact) return { matches: [], symbol: exact.symbol, error: null };
    if (matches.length) return { matches, symbol: null, error: null };
    if (!/^[A-Za-z0-9][A-Za-z0-9.^-]{0,19}$/.test(value)) {
      return { matches: [], symbol: null, error: 'No saved company matches that name. Try part of the name or a ticker.' };
    }
    return { matches: [], symbol: value.toUpperCase(), error: null };
  }

  lookup(symbol: string) {
    return this.instruments.getInstrumentBySymbol(symbol.trim().toUpperCase()).pipe(
      switchMap(instrument => this.quotes.getQuote(instrument.symbol).pipe(
        map(quote => ({ instrument, quote, error: null as string | null })),
        catchError(() => of({ instrument, quote: null, error: 'Failed to load stock price' })),
      )),
    );
  }
}
