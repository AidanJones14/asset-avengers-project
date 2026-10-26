const easternClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

// Convert an Eastern wall-clock input independently of the browser's timezone.
// During the repeated fall hour, choose its first occurrence; reject skipped spring times.
export function easternDateTime(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new Error('Choose a valid Eastern date and time.');
  const [, year, month, day, hour, minute, second = '00'] = match;
  const wallTime = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  const target = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  for (const offset of [4, 5]) {
    const candidate = new Date(wallTime + offset * 3600000);
    if (easternClock.format(candidate) === target) return candidate;
  }
  throw new Error('This Eastern date or time does not exist. Choose another time.');
}
