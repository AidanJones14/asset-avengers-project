import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';

describe('Authentication demo forms', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(routes)] }));
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
  it('opens login at the root and rejects empty input', async () => {
    const harness = await RouterTestingHarness.create('/');
    await submit(harness);
    expect(harness.routeNativeElement!.textContent).toContain('Enter a valid email address.');
    expect(harness.routeNativeElement!.textContent).toContain('Enter a password.');
  });
  it('rejects mismatched signup passwords and then allows a valid demo signup', async () => {
    const harness = await RouterTestingHarness.create('/signup');
    await fill(harness, {
      name: 'Demo User',
      email: 'demo@example.com',
      password: 'sample123',
      confirmation: 'different123',
    });
    await submit(harness);
    expect(harness.routeNativeElement!.textContent).toContain('Passwords must match.');
    await fill(harness, { confirmation: 'sample123' });
    await submit(harness);
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toContain(
      'Your portfolio, at a glance.',
    );
  });
  it('rejects a short signup password and a blank name', async () => {
    const harness = await RouterTestingHarness.create('/signup');
    await fill(harness, {
      name: '   ',
      email: 'demo@example.com',
      password: 'short',
      confirmation: 'short',
    });
    await submit(harness);
    expect(harness.routeNativeElement!.textContent).toContain('Enter your name.');
    expect(harness.routeNativeElement!.textContent).toContain(
      'Enter a password with at least 8 characters.',
    );
  });
  it('accepts a valid demo login', async () => {
    const harness = await RouterTestingHarness.create('/login');
    await fill(harness, { email: 'demo@example.com', password: 'demo-password' });
    await submit(harness);
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toContain(
      'Your portfolio, at a glance.',
    );
  });
});
