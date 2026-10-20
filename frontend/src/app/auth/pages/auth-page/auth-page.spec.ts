import { BankAccountApiService } from '../../../api/bank-accounts/bank-account-api.service';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { routes } from '../../../app.routes';
import { InstrumentApiService } from '../../../api/instruments/instrument-api.service';
import { AccountApiService } from '../../../api/accounts/account-api.service';
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
        { provide: AccountApiService, useValue: { accounts: signal([]), getAccounts: () => of([]), clear: () => undefined } },
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
    expect(harness.routeNativeElement!.textContent).toContain('You have no accounts yet');
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

  it('requires authenticator setup when the signup checkbox is selected', async () => {
    const harness = await RouterTestingHarness.create('/signup');
    await fill(harness, {
      email: 'new.client@example.com',
      password: 'long-enough-password',
      confirmation: 'long-enough-password',
      firstName: 'Cameron', lastName: 'Kelly',
    });
    harness.routeNativeElement!.querySelector<HTMLInputElement>('#signup-mfa')!.click();
    await submit(harness);
    const registration = http.expectOne('/auth/register');
    expect(registration.request.body).toEqual({ email: 'new.client@example.com', password: 'long-enough-password', firstName: 'Cameron', lastName: 'Kelly', mfaEnabled: true });
    registration.flush({ id: 'new-id', email: 'new.client@example.com', registered: true }, { status: 201, statusText: 'Created' });
    http.expectOne('/auth/login').flush({mfaRequired:true,purpose:'enroll',enrollmentRequired:true,challengeToken:'setup-only',secret:'TESTMANUALKEY',qrDataUrl:'data:image/png;base64,iVBORw0KGgo='});
    await settle(harness);
    expect(harness.routeNativeElement!.textContent).toContain('Microsoft Authenticator');
    expect(harness.routeNativeElement!.textContent).toContain('Set up your authenticator');
    expect(sessionStorage.getItem('endgame.refreshToken')).toBeNull();
    await fill(harness,{mfaCode:'123456'});await submit(harness);
    http.expectOne('/auth/mfa/enable').flush({...tokens(),recoveryCodes:['abcdef0123456789']});
    await settle(harness);
    expect(harness.routeNativeElement!.textContent).toContain('Save these recovery codes');
    const saved=Array.from(harness.routeNativeElement!.querySelectorAll('button')).find(button=>button.textContent?.includes('I saved my codes'))!;
    saved.click();await settle(harness);
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toContain('Set up your accounts.');
  });

  it('signs up without an authenticator when the optional checkbox is unchecked', async () => {
    const harness = await RouterTestingHarness.create('/signup');
    const checkbox = harness.routeNativeElement!.querySelector<HTMLInputElement>('#signup-mfa')!;
    expect(checkbox.checked).toBe(false);
    await fill(harness, { email: 'optional@example.com', password: 'long-enough-password',
      confirmation: 'long-enough-password', firstName: 'Optional', lastName: 'Client' });
    await submit(harness);
    const request = http.expectOne('/auth/register');
    expect(request.request.body.mfaEnabled).toBe(false);
    request.flush({ id: 'optional', email: 'optional@example.com', registered: true });
    http.expectOne('/auth/login').flush(tokens());
    await settle(harness);
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toContain('Set up your accounts.');
    expect(harness.routeNativeElement!.textContent).not.toContain('Scan this QR');
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
  it('does not save tokens or enter the portfolio until MFA is verified', async () => {
    const harness = await RouterTestingHarness.create('/login');
    await fill(harness, { email: 'mfa@example.com', password: 'EndgameDemo123!' });
    await submit(harness);
    http.expectOne('/auth/login').flush({ mfaRequired: true, challengeToken: 'challenge-only' });
    await settle(harness);
    expect(sessionStorage.getItem('endgame.refreshToken')).toBeNull();
    expect(harness.routeNativeElement!.textContent).toContain('Verify your identity');
    await fill(harness, { mfaCode: '123456' });
    await submit(harness);
    const request = http.expectOne('/auth/mfa/verify');
    expect(request.request.body).toEqual({challengeToken: 'challenge-only', code: '123456'});
    request.flush(tokens());
    await settle(harness);
    expect(sessionStorage.getItem('endgame.refreshToken')).toBe('refresh-1');
    expect(harness.routeNativeElement!.textContent).toContain('You have no accounts yet');
  });

  it('does not route a multi-role admin user into the client application', async () => {
    const harness = await RouterTestingHarness.create('/login');
    await fill(harness, { email: 'staff@example.com', password: 'EndgameDemo123!' });
    await submit(harness);
    const adminAndClient = fakeAccessToken(['ADMIN', 'CLIENT']);
    http.expectOne('/auth/login').flush({ accessToken: adminAndClient, refreshToken: 'refresh-1' });
    await settle(harness);
    expect(harness.routeNativeElement!.textContent).toContain('Use the separate Ultron or Friday sign-in page');
    http.expectOne('/auth/logout').flush({});
  });

  it('verifies the email before showing password fields and displays current-password rejection',async()=>{
    const harness=await RouterTestingHarness.create('/login');
    Array.from(harness.routeNativeElement!.querySelectorAll('button')).find(button=>button.textContent?.includes('Forgot password'))!.click();await settle(harness);
    expect(harness.routeNativeElement!.textContent).not.toContain('Your next move is waiting');
    await fill(harness,{resetEmail:'client@example.invalid'});await submit(harness);
    http.expectOne('/auth/forgot-password').flush({message:'If an account exists, a reset code will be sent.',requestToken:'opaque-reset'});await settle(harness);
    expect(harness.routeNativeElement!.querySelector('[name=newPassword]')).toBeNull();
    await fill(harness,{resetCode:'012345'});await submit(harness);
    const bad=http.expectOne('/auth/verify-reset-code');bad.flush({detail:'Invalid or expired reset code.'},{status:401,statusText:'Unauthorized'});await settle(harness);
    expect(harness.routeNativeElement!.querySelector('[name=newPassword]')).toBeNull();
    await submit(harness);const verification=http.expectOne('/auth/verify-reset-code');
    expect(verification.request.body).toEqual({requestToken:'opaque-reset',code:'012345'});
    verification.flush({resetToken:'verified-grant'});await settle(harness);
    expect(harness.routeNativeElement!.textContent).toContain('Email code verified');
    await fill(harness,{newPassword:'current-password',resetConfirmation:'current-password'});await submit(harness);
    const reused=http.expectOne('/auth/reset-password');expect(reused.request.body).toEqual({resetToken:'verified-grant',newPassword:'current-password'});
    reused.flush({code:'PASSWORD_REUSED',detail:'Your new password must be different from your current password.'},{status:400,statusText:'Bad Request'});await settle(harness);
    expect(harness.routeNativeElement!.textContent).toContain('Your new password must be different');
    await fill(harness,{newPassword:'a-new-long-password',resetConfirmation:'a-new-long-password'});await submit(harness);
    http.expectOne('/auth/reset-password').flush({message:'Password updated. Sign in with your new password and authenticator.'});await settle(harness);
    expect(sessionStorage.getItem('endgame.refreshToken')).toBeNull();
    expect(harness.routeNativeElement!.textContent).toContain('Password updated');
  });
});
