import { describe, expect, it } from 'vitest';
import {
  evaluateNotification,
  mergePreferencesWithSources,
} from '../src/domain/preference-evaluator.js';
import type { PreferenceEntry, GlobalPolicy } from '../src/domain/types.js';

const defaults: PreferenceEntry[] = [
  { notificationType: 'marketing_sms', channel: 'sms', enabled: false },
  { notificationType: 'transactional_sms', channel: 'sms', enabled: true },
];

const euMarketingBan: GlobalPolicy[] = [
  {
    notificationType: 'marketing_sms',
    channel: 'sms',
    region: 'EU',
    deny: true,
  },
];

describe('Scenario 4: Global policies (unit)', () => {
  it('global policy blocks marketing_sms in EU before user preference', () => {
    const preferences = mergePreferencesWithSources(defaults, [
      { notificationType: 'marketing_sms', channel: 'sms', enabled: true },
    ]);

    const result = evaluateNotification(
      {
        userId: 'u',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        datetime: '2026-05-21T21:30:00Z',
      },
      {
        userExists: true,
        preferences,
        quietHours: null,
        globalPolicies: euMarketingBan,
      },
    );

    expect(result).toEqual({
      decision: 'deny',
      reason: 'blocked_by_global_policy',
    });
  });

  it('same notification is allowed in US when policy targets EU only', () => {
    const preferences = mergePreferencesWithSources(defaults, [
      { notificationType: 'marketing_sms', channel: 'sms', enabled: true },
    ]);

    const result = evaluateNotification(
      {
        userId: 'u',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'US',
        datetime: '2026-05-21T21:30:00Z',
      },
      {
        userExists: true,
        preferences,
        quietHours: null,
        globalPolicies: euMarketingBan,
      },
    );

    expect(result).toEqual({ decision: 'allow' });
  });
});
