/**
 * Rule-based, educational tips derived from the client's current positions and cash.
 * Pure so the Learn page stays a thin view; this is general guidance, not advice.
 */

import { Asset } from './portfolio.store';

export interface InvestingTip {
  id: string;
  tone: 'info' | 'warning' | 'success';
  title: string;
  body: string;
}

const CONCENTRATION_LIMIT = 0.4;
const DIVERSIFIED_LIMIT = 0.25;
const MIN_DIVERSIFIED_HOLDINGS = 5;
const IDLE_CASH_SHARE = 0.5;

export function investingTips(input: { holdings: Asset[]; cashBalance: number }): InvestingTip[] {
  // Prices of 0 mean quotes are still loading; skip them rather than misjudge weights.
  const priced = input.holdings.filter((asset) => asset.shares > 0 && asset.price > 0);
  const cash = Math.max(0, input.cashBalance);

  if (!priced.length) {
    return cash > 0
      ? [{ id: 'uninvested', tone: 'info', title: 'Your cash isn’t invested yet', body: 'Cash is safe but rarely keeps pace with inflation. Read the basics below, then consider starting small with a broad, diversified position.' }]
      : [{ id: 'unfunded', tone: 'info', title: 'Fund your account to get started', body: 'Add money from the Bank Accounts tab. Make sure you already have an emergency fund set aside before investing.' }];
  }

  const values = priced.map((asset) => ({ symbol: asset.symbol, value: asset.shares * asset.price }));
  const invested = values.reduce((sum, item) => sum + item.value, 0);
  const largest = values.reduce((max, item) => (item.value > max.value ? item : max));
  const largestShare = largest.value / invested;
  const tips: InvestingTip[] = [];

  if (largestShare > CONCENTRATION_LIMIT) {
    tips.push({ id: 'concentration', tone: 'warning', title: `${largest.symbol} is ${Math.round(largestShare * 100)}% of your investments`, body: 'A single stock this large means one bad result can hurt your whole portfolio. Spreading money across more companies and sectors reduces that risk.' });
  }
  if (priced.length < MIN_DIVERSIFIED_HOLDINGS) {
    tips.push({ id: 'diversify', tone: 'info', title: `You hold ${priced.length} ${priced.length === 1 ? 'stock' : 'stocks'}`, body: 'Owning a wider mix of companies, or a broad fund, helps smooth out the ups and downs of any single business.' });
  }
  if (cash / (cash + invested) > IDLE_CASH_SHARE) {
    tips.push({ id: 'idle-cash', tone: 'info', title: 'Most of your account is cash', body: 'Holding some cash is sensible. If you’re investing for the long term, investing gradually (dollar-cost averaging) can put it to work without trying to time the market.' });
  }
  if (priced.length >= MIN_DIVERSIFIED_HOLDINGS && largestShare <= DIVERSIFIED_LIMIT) {
    tips.push({ id: 'diversified', tone: 'success', title: 'Nicely diversified', body: 'No single position dominates your portfolio. Review it now and then to keep it balanced as prices move.' });
  }
  return tips;
}
