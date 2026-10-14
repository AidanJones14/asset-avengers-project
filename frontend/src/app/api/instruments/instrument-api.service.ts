import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Instrument } from './instrument';

/** Override in application providers when the API is hosted at another origin. */
export const INSTRUMENT_API_URL = new InjectionToken<string>('INSTRUMENT_API_URL', {
  providedIn: 'root',
  factory: () => '/api/v1/instruments',
});

@Injectable({ providedIn: 'root' })
export class InstrumentApiService {
  private readonly http = inject(HttpClient);
  private readonly url = inject(INSTRUMENT_API_URL).replace(/\/+$/, '');

  getAllInstruments(): Observable<Instrument[]> {
    return this.http.get<Instrument[]>(this.url);
  }

  getInstrumentBySymbol(symbol: string): Observable<Instrument> {
    return this.http.get<Instrument>(`${this.url}/${encodeURIComponent(symbol)}`);
  }
}
