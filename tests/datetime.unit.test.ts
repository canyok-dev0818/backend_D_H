import { describe, expect, it } from 'vitest';
import {
  getLocalTimeParts,
  isValidIanaTimezone,
  parseIsoInstant,
  parseLocalTimeToMinutes,
} from '../src/domain/datetime.js';

describe('domain datetime (implementation requirements)', () => {
  it('parses ISO-8601 instants for evaluate', () => {
    const d = parseIsoInstant('2026-05-21T20:30:00Z');
    expect(d.toISOString()).toBe('2026-05-21T20:30:00.000Z');
  });

  it('rejects invalid ISO datetime', () => {
    expect(() => parseIsoInstant('not-a-date')).toThrow(/ISO-8601/);
  });

  it('validates IANA timezones', () => {
    expect(isValidIanaTimezone('Europe/Moscow')).toBe(true);
    expect(isValidIanaTimezone('Invalid/Zone')).toBe(false);
  });

  it('converts instant to local time in user timezone', () => {
    const instant = parseIsoInstant('2026-05-21T20:30:00Z');
    const local = getLocalTimeParts(instant, 'Europe/Moscow');
    expect(local).toEqual({ hour: 23, minute: 30 });
  });

  it('parses quiet hours HH:mm', () => {
    expect(parseLocalTimeToMinutes('22:00')).toBe(22 * 60);
    expect(parseLocalTimeToMinutes('08:00')).toBe(8 * 60);
  });
});
