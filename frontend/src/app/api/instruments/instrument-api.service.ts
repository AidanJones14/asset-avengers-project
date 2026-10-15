import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Instrument } from './instrument';

type InstrumentResponse = Omit<Instrument, 'active'> & { isActive?: boolean; active?: boolean };

function normalizeInstrument(value: InstrumentResponse): Instrument {
  const { isActive, ...instrument } = value;
  return { ...instrument, active: isActive ?? value.active ?? false };
}

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
    return this.http.get<InstrumentResponse[]>(this.url).pipe(
      map(instruments => instruments.map(normalizeInstrument)),
    );
  }

  getInstrumentBySymbol(symbol: string): Observable<Instrument> {
    return this.http.get<InstrumentResponse>(`${this.url}/${encodeURIComponent(symbol)}`).pipe(
      map(normalizeInstrument),
    );
  }
}
