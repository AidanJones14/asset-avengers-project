import { EasternDatePipe } from './eastern-date.pipe';

describe('Eastern time display', () => {
  const pipe = new EasternDatePipe();
  it('uses winter and summer offsets for the observation date', () => {
    expect(pipe.transform('2026-01-15T12:00:00Z', 'h:mm a')).toBe('7:00 AM ET');
    expect(pipe.transform('2026-07-15T12:00:00Z', 'h:mm a')).toBe('8:00 AM ET');
  });
});
