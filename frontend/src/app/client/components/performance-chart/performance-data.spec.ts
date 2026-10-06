import { rangeHistory, sampleHistory } from './performance-data';

describe('Performance history', () => {
  const history = sampleHistory(124675.45, new Date('2026-09-21T12:00:00Z'));
  it('provides deterministic dated observations ending at the portfolio value', () => {
    expect(history).toHaveLength(366);
    expect(history.at(-1)).toEqual({
      date: '2026-09-21',
      portfolio: 124675.45,
      benchmark: 124675.45,
    });
    expect(new Set(history.map((point) => point.date)).size).toBe(366);
  });
  it('selects the requested date window and rebases the benchmark', () => {
    const week = rangeHistory(history, '1W');
    expect(week).toHaveLength(8);
    expect(week[0].date).toBe('2026-09-14');
    expect(week[0].benchmark).toBe(week[0].portfolio);
    expect(rangeHistory(history, '1M')).toHaveLength(31);
    expect(rangeHistory(history, '3M')).toHaveLength(91);
    expect(rangeHistory(history, '1Y')).toHaveLength(366);
    expect(history[358].benchmark).not.toBe(week[0].benchmark);
  });
});
