export interface PerformancePoint {
  timestamp: number;
  value: number;
}

/** Keep real observations only; repeated observations in the same second replace the last point. */
export function recordPerformancePoint(history: PerformancePoint[], value: number, timestamp: number): PerformancePoint[] {
  if (!Number.isFinite(value) || !Number.isFinite(timestamp)) return history;
  const point = { timestamp, value };
  const last = history.at(-1);
  if (last && timestamp < last.timestamp) return history;
  if (last && Math.floor(last.timestamp / 1000) === Math.floor(timestamp / 1000)) {
    return [...history.slice(0, -1), point];
  }
  return [...history, point].slice(-240);
}
