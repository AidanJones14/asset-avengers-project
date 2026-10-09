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
      'Your portfolio.',
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

  it('signs up, then logs in with the same details', async () => {
    const harness = await RouterTestingHarness.create('/signup');
    await fill(harness, {
      email: 'new.client@example.com',
      password: 'long-enough-password',
      confirmation: 'long-enough-password',
    });
    await submit(harness);
    http
      .expectOne('/auth/register')
      .flush({ id: 'new-id', email: 'new.client@example.com', registered: true }, { status: 201, statusText: 'Created' });
    http.expectOne('/auth/login').flush(tokens());
    await settle(harness);
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toContain(
      'Your portfolio.',
    );
  });

  it('explains an email that is already registered', async () => {
    const harness = await RouterTestingHarness.create('/signup');
    await fill(harness, {
      email: 'frank.client@example.com',
      password: 'long-enough-password',
      confirmation: 'long-enough-password',
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

  it('sends someone who is not logged in from a client page to login', async () => {
    const harness = await RouterTestingHarness.create('/client/overview');
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toContain(
      'Log in to your dashboard.',
    );
  });
});

