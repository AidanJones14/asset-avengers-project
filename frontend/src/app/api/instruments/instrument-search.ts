import { Instrument } from './instrument';

const aliases: Record<string, string> = {
  GOOG: 'Google', GOOGL: 'Google', META: 'Facebook', IBM: 'IBM', BRK_B: 'Berkshire Hathaway',
};

/** Catalogue-only matching: no quote requests are made while searching company names. */
export function matchingInstruments(instruments: Instrument[], query: string): Instrument[] {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const term = normalize(query);
  return instruments.filter(instrument => [instrument.symbol, instrument.name,
    aliases[instrument.symbol.replace('-', '_')] ?? ''].some(value => normalize(value).includes(term)));
}
