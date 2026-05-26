import { describe, expect, it } from 'vitest';
import {
  evaluateNotification,
  mergePreferencesWithSources,
} from '../src/domain/preference-evaluator.js';
import type { PreferenceEntry } from '../src/domain/types.js';

const defaults: PreferenceEntry[] = [
  { notificationType: 'transactional_email', channel: 'email', enabled: true },
  { notificationType: 'marketing_email', channel: 'email', enabled: false },
];

describe('Scenario 2: User changes preferences (unit)', () => {
  it('user opt-out of marketing does not affect transactional on evaluate', () => {
    const preferences = mergePreferencesWithSources(defaults, [
      {
        notificationType: 'marketing_email',
        channel: 'email',
        enabled: false,
      },
    ]);

    const allowTx = evaluateNotification(
      {
        userId: 'u',
        notificationType: 'transactional_email',
        channel: 'email',
        region: 'US',
        datetime: '2026-05-21T12:00:00Z',
      },
      {
        userExists: true,
        preferences,
        quietHours: null,
        globalPolicies: [],
      },
    );
    expect(allowTx).toEqual({ decision: 'allow' });

    const denyMkt = evaluateNotification(
      {
        userId: 'u',
        notificationType: 'marketing_email',
        channel: 'email',
        region: 'US',
        datetime: '2026-05-21T12:00:00Z',
      },
      {
        userExists: true,
        preferences,
        quietHours: null,
        globalPolicies: [],
      },
    );
    expect(denyMkt).toEqual({
      decision: 'deny',
      reason: 'disabled_by_user_preference',
    });
  });
});
