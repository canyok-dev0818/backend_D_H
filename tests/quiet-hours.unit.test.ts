import { describe, expect, it } from 'vitest';
import { isWithinQuietHours } from '../src/domain/quiet-hours.js';

describe('quiet hours (unit)', () => {
  const quietHours = {
    timezone: 'Europe/Moscow',
    start: '22:00',
    end: '08:00',
  };

  it('detects overnight window in user timezone', () => {
    const instant = new Date('2026-05-21T20:30:00Z'); // 23:30 MSK
    expect(
      isWithinQuietHours(quietHours, instant, 'marketing_push'),
    ).toBe(true);
    expect(
      isWithinQuietHours(quietHours, instant, 'transactional_push'),
    ).toBe(false);
  });

  it('returns false outside quiet window', () => {
    const instant = new Date('2026-05-21T10:00:00Z'); // 13:00 MSK
    expect(
      isWithinQuietHours(quietHours, instant, 'marketing_email'),
    ).toBe(false);
  });
});
