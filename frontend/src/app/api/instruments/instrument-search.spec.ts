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
  it('does not guess a ticker for an unknown company', () => {
    expect(matchingInstruments(catalogue, 'Unknown Company')).toEqual([]);
  });
});
