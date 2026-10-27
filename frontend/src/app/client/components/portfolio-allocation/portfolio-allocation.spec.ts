import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PortfolioAllocation } from './portfolio-allocation';
import { Asset, PortfolioStore } from '../../state/portfolio.store';

describe('Live portfolio allocation', () => {
  it('updates the chart after buys, sells and price changes without counting reservations as spent cash', () => {
    const holdings = signal<Asset[]>([]);
    const cashBalance = signal(1000);
    const cash = signal(1000);
    TestBed.configureTestingModule({ providers: [
      { provide: PortfolioStore, useValue: { holdings, cashBalance, cash } },
    ] });
    const fixture = TestBed.createComponent(PortfolioAllocation);
    const chart = () => fixture.nativeElement.querySelector('[role="img"]').getAttribute('aria-label');
    fixture.detectChanges();
    expect(chart()).toBe('Cash 100.0%');
    cash.set(800); // An accepted buy reserves cash but has not filled.
    fixture.detectChanges();
    expect(fixture.componentInstance.allocation().find(item => item.name === 'Cash')?.value).toBe(1000);
    cashBalance.set(800);
    holdings.set([{ symbol: 'AAPL', name: 'Apple', shares: 2, price: 100,
      cost: 100, change: 0, instrumentId: 'apple' }]);
    fixture.detectChanges();
    expect(chart()).toBe('AAPL 20.0%, Cash 80.0%');
    holdings.update(assets => assets.map(asset => ({ ...asset, price: 200 })));
    fixture.detectChanges();
    expect(chart()).toBe('AAPL 33.3%, Cash 66.7%');
    cashBalance.set(1200);
    holdings.set([]);
    fixture.detectChanges();
    expect(chart()).toBe('Cash 100.0%');
    cashBalance.set(0);
    fixture.detectChanges();
    expect(chart()).toBe('No assets to display');
  });
});
