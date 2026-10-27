import { Asset } from './portfolio.store';
import { investingTips } from './investing-tips';

const asset = (symbol: string, shares: number, price: number) =>
  ({ symbol, name: symbol, shares, price, change: 0, cost: price, instrumentId: symbol }) as Asset;
const ids = (holdings: Asset[], cashBalance = 0) => investingTips({ holdings, cashBalance }).map((tip) => tip.id);

describe('investingTips', () => {
  it('asks unfunded clients to deposit', () => {
    expect(ids([])).toEqual(['unfunded']);
  });

  it('flags cash that is not invested', () => {
    expect(ids([], 500)).toEqual(['uninvested']);
  });

  it('ignores holdings whose quote is still loading', () => {
    expect(ids([asset('AAPL', 10, 0)], 500)).toEqual(['uninvested']);
  });

  it('warns about a concentrated position and too few holdings', () => {
    const tips = investingTips({ holdings: [asset('AAPL', 10, 100), asset('MSFT', 1, 100)], cashBalance: 0 });
    expect(tips.map((tip) => tip.id)).toEqual(['concentration', 'diversify']);
    expect(tips[0].title).toContain('AAPL is 91%');
  });

  it('notes mostly-cash accounts', () => {
    expect(ids([asset('AAPL', 1, 100)], 1000)).toContain('idle-cash');
  });

  it('praises a balanced portfolio', () => {
    const holdings = ['A', 'B', 'C', 'D', 'E'].map((symbol) => asset(symbol, 1, 100));
    expect(ids(holdings)).toEqual(['diversified']);
  });
});
