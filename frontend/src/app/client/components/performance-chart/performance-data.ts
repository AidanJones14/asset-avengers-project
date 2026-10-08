export type ChartRange = '1W' | '1M' | '3M' | '1Y';
export interface PerformancePoint {
  date: string;
  portfolio: number;
  benchmark: number;
}
export const RANGE_DAYS: Record<ChartRange, number> = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365 };

// Deterministic illustrative history. Replace with dated API observations when available.
export function sampleHistory(value: number, end = new Date()): PerformancePoint[] {
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Array.from({ length: 366 }, (_, i) => {
    const age = 365 - i;
    const trend = 1 - age * 0.0007;
    const wave = Math.sin(age * 0.7) * 0.009 + Math.sin(age * 0.15) * 0.016;
    return {
      date: new Date(endDay - age * 86400000).toISOString().slice(0, 10),
      portfolio: Math.round(value * (trend + wave) * 100) / 100,
      benchmark: Math.round(value * (1 - age * 0.00045 + Math.sin(age * 0.13) * 0.008) * 100) / 100,
    };
  });
}
export function rangeHistory(history: PerformancePoint[], range: ChartRange): PerformancePoint[] {
  const points = history.slice(-(RANGE_DAYS[range] + 1));
  if (!points.length) return [];
  // Rebase the comparison to the same opening dollar value for each selected period.
  const scale = points[0].portfolio / points[0].benchmark;
  return points.map((point) => ({
    ...point,
    benchmark: Math.round(point.benchmark * scale * 100) / 100,
  }));
}
