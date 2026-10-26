import { easternDateTime } from './eastern-time';

describe('Eastern date/time inputs', () => {
  it('uses the date-specific offset rather than the browser timezone', () => {
    expect(easternDateTime('2026-01-15T19:00').toISOString()).toBe('2026-01-16T00:00:00.000Z');
    expect(easternDateTime('2026-07-15T19:00').toISOString()).toBe('2026-07-15T23:00:00.000Z');
  });
  it('rejects skipped daylight saving times and invalid calendar dates', () => {
    expect(() => easternDateTime('2026-03-08T02:30')).toThrow('does not exist');
    expect(() => easternDateTime('2026-02-30T19:00')).toThrow('does not exist');
  });
  it('uses the first occurrence of a repeated fall time', () => {
    expect(easternDateTime('2026-11-01T01:30').toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });
});
