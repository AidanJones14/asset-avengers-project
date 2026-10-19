import { BankAccountApiService } from '../../../api/bank-accounts/bank-account-api.service';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { routes } from '../../../app.routes';
import { InstrumentApiService } from '../../../api/instruments/instrument-api.service';
import { fakeAccessToken } from '../../testing';

describe('Login and signup', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: BankAccountApiService, useValue: { getTradingAccount: () => of({
          accountId: 'test-account', cashBalance: 0, availableCash: 0, realizedReturn: 0, holdings: [], orders: [], watchedSymbols: [],
        }) } },
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: InstrumentApiService, useValue: { getAllInstruments: () => of([]) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  async function fill(harness: RouterTestingHarness, values: Record<string, string>) {
    for (const [name, value] of Object.entries(values)) {
      const input = harness.routeNativeElement!.querySelector<HTMLInputElement>(
        `input[name="${name}"]`,
      )!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    await harness.fixture.whenStable();
  }
  async function submit(harness: RouterTestingHarness) {
    harness
      .routeNativeElement!.querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
  async function settle(harness: RouterTestingHarness) {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
  const tokens = () => ({ accessToken: fakeAccessToken(['CLIENT']), refreshToken: 'refresh-1' });

  it('opens login at the root and rejects empty input', async () => {
    const harness = await RouterTestingHarness.create('/');
    await submit(harness);
    expect(harness.routeNativeElement!.textContent).toContain('Enter a valid email address.');
    expect(harness.routeNativeElement!.textContent).toContain('Enter a password.');
  });

  it('rejects mismatched and short signup passwords without calling the server', async () => {
    const harness = await RouterTestingHarness.create('/signup');
    await fill(harness, {
      email: 'demo@example.com',
      password: 'long-enough-password',
      confirmation: 'different-password',
    });
    await submit(harness);
    expect(harness.routeNativeElement!.textContent).toContain('Passwords must match.');
    await fill(harness, { password: 'short', confirmation: 'short' });
    await submit(harness);
    expect(harness.routeNativeElement!.textContent).toContain(
      'Enter a password with 12 to 72 characters.',
    );
  });

  it('logs a client in, keeps the refresh token for this tab, and opens the overview', async () => {
    const harness = await RouterTestingHarness.create('/login');
    await fill(harness, { email: 'frank.client@example.com', password: 'EndgameDemo123!' });
    await submit(harness);
    const request = http.expectOne('/auth/login');
    expect(request.request.body).toEqual({
      email: 'frank.client@example.com',
      password: 'EndgameDemo123!',
    });
    request.flush(tokens());
    await settle(harness);
    expect(sessionStorage.getItem('endgame.refreshToken')).toBe('refresh-1');
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toContain(
      'Dashboard',
    );
  });

  it('shows one message for a wrong password or unknown email', async () => {
    const harness = await RouterTestingHarness.create('/login');
    await fill(harness, { email: 'frank.client@example.com', password: 'wrong' });
    await submit(harness);
    http
      .expectOne('/auth/login')
      .flush(
        { title: 'Unauthorized', status: 401, code: 'UNAUTHORIZED' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await settle(harness);
    expect(harness.routeNativeElement!.textContent).toContain('Invalid email or password.');
  });

  it('returns to login after registration without starting a session', async () => {
    const harness = await RouterTestingHarness.create('/signup');
    await fill(harness, {
      email: 'new.client@example.com',
      password: 'long-enough-password',
      confirmation: 'long-enough-password',
      firstName: 'Cameron', lastName: 'Kelly',
    });
    await submit(harness);
    const registration = http.expectOne('/auth/register');
    expect(registration.request.body).toEqual({ email: 'new.client@example.com', password: 'long-enough-password', firstName: 'Cameron', lastName: 'Kelly' });
    registration.flush({ id: 'new-id', email: 'new.client@example.com', registered: true }, { status: 201, statusText: 'Created' });
    await settle(harness);
    http.expectNone('/auth/login');
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toContain('Log in to your dashboard.');
    expect(harness.routeNativeElement!.textContent).toContain('Account created');
    expect(harness.routeNativeElement!.textContent).toContain('Please log in');
    expect(harness.routeNativeElement!.querySelector<HTMLInputElement>('input[name="password"]')!.value).toBe('');
    expect(sessionStorage.getItem('endgame.refreshToken')).toBeNull();
  });

  it('explains an email that is already registered', async () => {
    const harness = await RouterTestingHarness.create('/signup');
    await fill(harness, {
      email: 'frank.client@example.com',
      password: 'long-enough-password',
      confirmation: 'long-enough-password',
      firstName: 'Cameron', lastName: 'Kelly',
    });
    await submit(harness);
    http
      .expectOne('/auth/register')
      .flush(
        { title: 'Conflict', status: 409, code: 'CONFLICT' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle(harness);
    expect(harness.routeNativeElement!.textContent).toContain('That email is already registered.');
  });

  it('requires first and last name on signup', async () => {
    const harness = await RouterTestingHarness.create('/signup');
    await fill(harness, { email: 'client@example.com', password: 'long-enough-password', confirmation: 'long-enough-password' });
    await submit(harness);
    http.expectNone('/auth/register');
    expect(harness.routeNativeElement!.textContent).toContain('Enter your first name');
    expect(harness.routeNativeElement!.textContent).toContain('Enter your last name');
  });

  it('sends someone who is not logged in from a client page to login', async () => {
    const harness = await RouterTestingHarness.create('/client/overview');
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toContain(
      'Log in to your dashboard.',
    );
  });
  it('displays the signed full name, including international characters, after login', async () => {
    const harness = await RouterTestingHarness.create('/login');
    await fill(harness, { email: 'client@example.com', password: 'EndgameDemo123!' });
    await submit(harness);
    const payload = { sub: '00000000-0000-0000-0000-000000000006', email: 'client@example.com',
      roles: ['CLIENT'], name: 'Caméron 李', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 };
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))));
    http.expectOne('/auth/login').flush({ accessToken: `header.${encoded}.signature`, refreshToken: 'refresh-1' });
    await settle(harness);
    expect(harness.routeNativeElement!.querySelector('aside footer strong')!.textContent).toContain('Caméron 李');
  });
});
