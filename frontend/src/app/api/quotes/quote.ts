/** Quote data returned directly from the backend OrderQuoteService */
export interface Quote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  spreadBps: number;
  currency: string | null;
  change: number | null;
  changePercent: number | null;
  previousClose: number | null;
  asOf: string;
  marketState: string;
  stale: boolean;
  source: string;
}
