import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';
import { PortfolioStore } from './portfolio.store';

describe('Client workspace', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter(routes)] }),
  );
  it('renders the client navigation', async () => {
    const harness = await RouterTestingHarness.create('/client/overview');
    expect(harness.routeNativeElement?.querySelector('nav')?.textContent).toContain('Portfolio');
  });
  it('connects a holding trade through review to shared order history', async () => {
    const harness = await RouterTestingHarness.create('/client/portfolio');
    const root = harness.routeNativeElement!;
    const dialog = root.querySelector('dialog')!;
    // jsdom does not implement native modal behavior; exercise the Angular flow around it.
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => dialog.removeAttribute('open');
    root.querySelector<HTMLButtonElement>('[aria-label="Trade AAPL"]')!.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    expect(root.querySelector<HTMLSelectElement>('#asset')!.value).toBe('AAPL');
    const quantity = root.querySelector<HTMLInputElement>('#quantity')!;
    quantity.value = '2';
    quantity.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    harness.detectChanges();
    expect(dialog.textContent).toContain('Review simulated order');
    dialog.querySelector<HTMLButtonElement>('.primary.full')!.click();
    harness.detectChanges();
    expect(root.querySelector('[role="status"]')!.textContent).toContain('Simulated order filled');
    expect(
      TestBed.inject(PortfolioStore)
        .assets()
        .find((asset) => asset.symbol === 'AAPL')!.shares,
    ).toBe(87);
    await harness.navigateByUrl('/client/orders');
    expect(harness.routeNativeElement!.querySelector('tbody')!.textContent).toContain('AAPL');
  });
  it('keeps client chrome off authentication routes', async () => {
    const harness = await RouterTestingHarness.create('/client/overview');
    await harness.navigateByUrl('/login');
    expect(harness.routeNativeElement!.querySelector('nav')).toBeNull();
    await harness.navigateByUrl('/client/orders');
    expect(harness.routeNativeElement!.querySelectorAll('nav').length).toBe(1);
  });
  it('supports direct navigation to each client page', async () => {
    const harness = await RouterTestingHarness.create();
    for (const page of ['overview', 'portfolio', 'orders']) {
      await harness.navigateByUrl(`/client/${page}`);
      expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe(
        page === 'overview'
          ? 'Your portfolio, at a glance.'
          : page[0].toUpperCase() + page.slice(1),
      );
    }
    expect(harness.routeNativeElement?.textContent).toContain('No orders yet');
  });
  it('shows simulated trades in order history after navigation', async () => {
    const harness = await RouterTestingHarness.create('/client/portfolio');
    TestBed.inject(PortfolioStore).trade('NVDA', 'buy', 2);
    await harness.navigateByUrl('/client/orders');
    expect(harness.routeNativeElement?.querySelector('tbody')?.textContent).toContain('NVDA');
    expect(harness.routeNativeElement?.textContent).toContain('Simulated fill');
  });
});

describe('PortfolioStore', () => {
  let store: PortfolioStore;
  beforeEach(() => {
    store = new PortfolioStore();
  });
  it('updates cash, holdings and history while preserving portfolio value on a buy', () => {
    const value = store.value();
    expect(store.trade('NVDA', 'buy', 2)).toBe('');
    expect(store.cash()).toBe(28164.26);
    expect(store.assets()[0].shares).toBe(122);
    expect(store.value()).toBe(value);
    expect(store.orders()[0].total).toBe(285.74);
  });
  it('rejects invalid quantities, insufficient funds and overselling without mutations', () => {
    for (const quantity of [0, -1, 1.5, NaN, Infinity, 100000])
      expect(store.trade('NVDA', 'buy', quantity)).not.toBe('');
    expect(store.trade('NVDA', 'sell', 121)).not.toBe('');
    expect(store.cash()).toBe(28450);
    expect(store.orders()).toEqual([]);
  });
  it('removes a sold-out holding and retains realized returns', () => {
    const totalReturn = store.totalReturn();
    expect(store.trade('NVDA', 'sell', 120)).toBe('');
    expect(store.holdings().length).toBe(4);
    expect(store.cash()).toBe(45594.4);
    expect(store.totalReturn()).toBe(totalReturn);
  });
});

