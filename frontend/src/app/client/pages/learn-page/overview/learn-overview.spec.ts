import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Asset, PortfolioStore } from '../../../state/portfolio.store';
import { LearnOverview } from './learn-overview';

describe('Learn overview tips', () => {
  it('recomputes tips when holdings change', () => {
    const holdings = signal<Asset[]>([]);
    const cashBalance = signal(250);
    TestBed.configureTestingModule({ providers: [{ provide: PortfolioStore, useValue: { holdings, cashBalance } }] });
    const page = TestBed.runInInjectionContext(() => new LearnOverview());
    expect(page.tips().map((tip) => tip.id)).toEqual(['uninvested']);
    expect(page.tipVideos.get('uninvested')?.id).toBe('rLBdIOikjz8');
    holdings.set([{ symbol: 'AAPL', name: 'Apple', shares: 2, price: 100, change: 0, cost: 100, instrumentId: '1' }]);
    expect(page.tips().map((tip) => tip.id)).toContain('concentration');
  });
});
