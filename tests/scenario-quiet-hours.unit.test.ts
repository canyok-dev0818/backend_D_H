import { describe, expect, it } from 'vitest';
import { evaluateNotification } from '../src/domain/preference-evaluator.js';
import { mergePreferencesWithSources } from '../src/domain/preference-evaluator.js';
import { isWithinQuietHours } from '../src/domain/quiet-hours.js';
import type { PreferenceEntry, QuietHours } from '../src/domain/types.js';

const defaults: PreferenceEntry[] = [
  { notificationType: 'transactional_push', channel: 'push', enabled: true },
  { notificationType: 'marketing_push', channel: 'push', enabled: true },
];

const quietHours: QuietHours = {
  timezone: 'Europe/Moscow',
  start: '22:00',
  end: '08:00',
};

describe('Scenario 3: Quiet hours (unit)', () => {
  it('22:00–08:00 MSK blocks marketing_push at 23:30 local', () => {
    const instant = new Date('2026-05-21T20:30:00Z');
    expect(isWithinQuietHours(quietHours, instant, 'marketing_push')).toBe(true);
    expect(isWithinQuietHours(quietHours, instant, 'transactional_push')).toBe(
      false,
    );
  });

  it('evaluate denies marketing_push but allows transactional_push during quiet hours', () => {
    const preferences = mergePreferencesWithSources(defaults, []);
    const instant = '2026-05-21T20:30:00Z';

    const marketing = evaluateNotification(
      {
        userId: 'u',
        notificationType: 'marketing_push',
        channel: 'push',
        region: 'RU',
        datetime: instant,
      },
      { userExists: true, preferences, quietHours, globalPolicies: [] },
    );
    expect(marketing).toEqual({
      decision: 'deny',
      reason: 'blocked_by_quiet_hours',
    });

    const transactional = evaluateNotification(
      {
        userId: 'u',
        notificationType: 'transactional_push',
        channel: 'push',
        region: 'RU',
        datetime: instant,
      },
      { userExists: true, preferences, quietHours, globalPolicies: [] },
    );
    expect(transactional).toEqual({ decision: 'allow' });
  });
});
