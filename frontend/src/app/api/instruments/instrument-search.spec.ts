import { matchingInstruments } from './instrument-search';
import { Instrument } from './instrument';

const instrument = (symbol: string, name: string) => ({ symbol, name } as Instrument);
describe('company catalogue search', () => {
  const catalogue = [instrument('AAPL', 'Apple Inc.'), instrument('GOOG', 'Alphabet Inc.'),
    instrument('GOOGL', 'Alphabet Inc.'), instrument('IBM', 'International Business Machines')];
  it('finds company names and tickers regardless of case or punctuation', () => {
    expect(matchingInstruments(catalogue, ' apple ')).toEqual([catalogue[0]]);
    expect(matchingInstruments(catalogue, 'aapl')).toEqual([catalogue[0]]);
    expect(matchingInstruments(catalogue, 'Business Machines')).toEqual([catalogue[3]]);
  });
  it('returns both share classes for a familiar company alias so the user can choose', () => {
    expect(matchingInstruments(catalogue, 'Google')).toEqual(catalogue.slice(1, 3));
    expect(matchingInstruments(catalogue, 'Alphabet')).toEqual(catalogue.slice(1, 3));
  });
  it('returns matching funds by issuer name without choosing a single ticker', () => {
    const funds = [instrument('VOO', 'Vanguard S&P 500 ETF'),
      instrument('VXUS', 'Vanguard Total International Stock ETF'),
      instrument('QQQM', 'Invesco NASDAQ 100 ETF')];
    expect(matchingInstruments(funds, 'vanguard')).toEqual(funds.slice(0, 2));
    expect(matchingInstruments(funds, 'S&P 500')).toEqual([funds[0]]);
    expect(matchingInstruments(funds, 'invesco')).toEqual([funds[2]]);
  });
  it('does not guess a ticker for an unknown company', () => {
    expect(matchingInstruments(catalogue, 'Unknown Company')).toEqual([]);
  });
  it('ranks exact tickers before ticker prefixes and company-name substrings', () => {
    const stocks = [instrument('CAT', 'Caterpillar'), instrument('TERN', 'Terns'),
      instrument('TER', 'Teradyne')];
    expect(matchingInstruments(stocks, 'TER')).toEqual([stocks[2], stocks[1], stocks[0]]);
    expect(matchingInstruments(stocks, '---')).toEqual([]);
  });
});
