import { recordPerformancePoint } from './performance-data';

describe('portfolio observations', () => {
  it('keeps unchanged actual values without generating movement', () => {
    const first = recordPerformancePoint([], 2500, 1000);
    expect(recordPerformancePoint(first, 2500, 16000)).toEqual([
      { timestamp: 1000, value: 2500 }, { timestamp: 16000, value: 2500 },
    ]);
    expect(first).toHaveLength(1);
  });

  it('replaces updates within the same second', () => {
    expect(recordPerformancePoint([{ timestamp: 1000, value: 10 }], 20, 1500))
      .toEqual([{ timestamp: 1500, value: 20 }]);
  });

  it('rejects invalid and out-of-order observations', () => {
    const history = [{ timestamp: 2000, value: 10 }];
    expect(recordPerformancePoint(history, NaN, 3000)).toBe(history);
    expect(recordPerformancePoint(history, 20, Infinity)).toBe(history);
    expect(recordPerformancePoint(history, 20, 1000)).toBe(history);
  });

  it('bounds the session history to the latest 240 observations', () => {
    const history = Array.from({ length: 240 }, (_, i) => ({ timestamp: i * 15000, value: i }));
    const result = recordPerformancePoint(history, 240, 3600000);
    expect(result).toHaveLength(240);
    expect(result[0]).toEqual(history[1]);
    expect(result.at(-1)).toEqual({ timestamp: 3600000, value: 240 });
  });
});
