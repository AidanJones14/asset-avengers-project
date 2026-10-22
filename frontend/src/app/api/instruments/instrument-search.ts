/**
 * Shared company/ticker matching over saved catalogue metadata. This stays local
 * to avoid paid quote calls for typing, and returns multiple matches instead of
 * silently selecting a company's share class.
 */

import { Instrument } from './instrument';

const aliases: Record<string, string> = {
  GOOG: 'Google', GOOGL: 'Google', META: 'Facebook', IBM: 'IBM', BRK_B: 'Berkshire Hathaway',
};

/** Catalogue-only matching: no quote requests are made while searching company names. */
export function matchingInstruments(instruments: Instrument[], query: string): Instrument[] {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const term = normalize(query);
  if (!term) return [];
  const rank = (instrument: Instrument) => {
    const symbol = normalize(instrument.symbol);
    return symbol === term ? 0 : symbol.startsWith(term) ? 1 : 2;
  };
  return instruments.filter(instrument => [instrument.symbol, instrument.name,
    aliases[instrument.symbol.replace('-', '_')] ?? ''].some(value => normalize(value).includes(term)))
    .sort((a, b) => rank(a) - rank(b));
}
