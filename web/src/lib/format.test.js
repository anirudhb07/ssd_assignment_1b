import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatTime } from './format.js';

// The tests run in UTC; the app must still show India Standard Time (UTC+5:30).
describe('times are shown in India Standard Time', () => {
  it('formats a UTC timestamp in IST, on a 24-hour clock', () => {
    expect(formatDateTime('2026-10-12T05:12:00Z')).toBe('12 Oct, 10:42');
    expect(formatTime('2026-10-12T05:12:09Z')).toBe('10:42:09');
  });

  it('moves the date forward when IST is already the next day', () => {
    expect(formatDateTime('2026-10-12T20:00:00Z')).toBe('13 Oct, 01:30');
    expect(formatDate('2026-10-12T20:00:00Z')).toBe('13 Oct 2026');
  });

  it('shows a dash for a missing value', () => {
    expect(formatDateTime(null)).toBe('—');
  });
});
