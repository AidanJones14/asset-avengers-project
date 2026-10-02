/** Matches the Instrument entity returned by the Spring instrument controller. */
export type SecurityType = 'equity' | 'etf' | 'bond' | 'option' | 'future' | 'crypto' | 'mutual_fund';

export interface Instrument {
  instrumentId: string;
  symbol: string;
  name: string;
  securityType: SecurityType;
  exchange: string | null;
  currency: string;
  isin: string | null;
  active: boolean;
}
