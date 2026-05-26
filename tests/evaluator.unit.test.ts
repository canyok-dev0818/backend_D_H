import { describe, expect, it } from 'vitest';
import { evaluateNotification } from '../src/domain/preference-evaluator.js';
import type { PreferenceEntry } from '../src/domain/types.js';

const enabledDefaults: PreferenceEntry[] = [
  { notificationType: 'transactional_email', channel: 'email', enabled: true },
  { notificationType: 'marketing_email', channel: 'email', enabled: false },
];

describe('preference evaluator (unit)', () => {
  it('applies global policy before user preference', () => {
    const result = evaluateNotification(
      {
        userId: 'u1',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        datetime: '2026-05-21T12:00:00Z',
      },
      {
        userExists: true,
        preferences: [
          ...enabledDefaults,
          { notificationType: 'marketing_sms', channel: 'sms', enabled: true },
        ],
        quietHours: null,
        globalPolicies: [
          {
            notificationType: 'marketing_sms',
            channel: 'sms',
            region: 'EU',
            deny: true,
          },
        ],
      },
    );
    expect(result).toEqual({
      decision: 'deny',
      reason: 'blocked_by_global_policy',
    });
  });
});
