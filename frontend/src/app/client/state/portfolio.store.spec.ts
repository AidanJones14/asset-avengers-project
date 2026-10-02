import { PortfolioStore } from './portfolio.store';

describe('Market watch', () => {
  it('adds and removes selections without changing portfolio positions or cash', () => {
    const store = new PortfolioStore();
    const value = store.value();
    const assets = store.assets();
    const cash = store.cash();
    store.toggleWatch('NVDA');
    expect(store.watchlist().map(asset => asset.symbol)).toEqual(['NVDA']);
    store.toggleWatch('NVDA');
    expect(store.watchlist()).toEqual([]);
    expect(store.assets()).toBe(assets);
    expect(store.cash()).toBe(cash);
    expect(store.value()).toBe(value);
  });
  it('ignores unknown symbols and keeps watched prices reactive', () => {
    const store = new PortfolioStore();
    store.toggleWatch('UNKNOWN');
    expect(store.watchedSymbols()).toEqual([]);
    store.toggleWatch('AAPL');
    store.assets.update(assets => assets.map(asset => asset.symbol === 'AAPL' ? { ...asset, price: 250 } : asset));
    expect(store.watchlist()[0].price).toBe(250);
  });
});
