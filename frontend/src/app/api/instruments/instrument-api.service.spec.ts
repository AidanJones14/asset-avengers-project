import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { INSTRUMENT_API_URL, InstrumentApiService } from './instrument-api.service';
import { Instrument } from './instrument';

describe('InstrumentApiService', () => {
  let service: InstrumentApiService;
  let http: HttpTestingController;
  const instrument: Instrument = {
    instrumentId: 'a1c7480a-5c40-44b8-9836-f389fdd467dc',
    symbol: 'AAPL', name: 'Apple', securityType: 'equity',
    exchange: 'NASDAQ', currency: 'USD', isin: null, active: true,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(InstrumentApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the instrument list using the implemented backend route', () => {
    let result: Instrument[] | undefined;
    service.getAllInstruments().subscribe(value => result = value);
    const request = http.expectOne('/instruments');
    expect(request.request.method).toBe('GET');
    request.flush([instrument]);
    expect(result).toEqual([instrument]);
  });

  it('encodes symbols as a single URL segment', () => {
    service.getInstrumentBySymbol('BRK/B').subscribe(value => expect(value).toEqual(instrument));
    const request = http.expectOne('/instruments/symbol/BRK%2FB');
    expect(request.request.method).toBe('GET');
    request.flush(instrument);
  });

  it('preserves authentication errors for the caller', () => {
    let error: HttpErrorResponse | undefined;
    service.getAllInstruments().subscribe({ error: value => error = value });
    http.expectOne('/instruments').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(error?.status).toBe(401);
  });

  it('supports a configured endpoint with a trailing slash', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: INSTRUMENT_API_URL, useValue: 'https://api.example.test/instruments/' },
    ] });
    service = TestBed.inject(InstrumentApiService);
    http = TestBed.inject(HttpTestingController);
    service.getInstrumentBySymbol('AAPL').subscribe();
    http.expectOne('https://api.example.test/instruments/symbol/AAPL').flush(instrument);
  });
});
