import { describe, expect, it } from 'vitest';
import {
  EVALUATION_RULE_ORDER,
  evaluateNotification,
  mergePreferencesWithSources,
} from '../src/domain/preference-evaluator.js';
import type {
  GlobalPolicy,
  PreferenceEntry,
  QuietHours,
} from '../src/domain/types.js';

const defaults: PreferenceEntry[] = [
  { notificationType: 'transactional_email', channel: 'email', enabled: true },
  { notificationType: 'marketing_email', channel: 'email', enabled: false },
  { notificationType: 'marketing_push', channel: 'push', enabled: false },
];

function ctx(overrides: Partial<{
  preferences: ReturnType<typeof mergePreferencesWithSources>;
  quietHours: QuietHours | null;
  globalPolicies: GlobalPolicy[];
  userExists: boolean;
}> = {}) {
  return {
    userExists: true,
    preferences: mergePreferencesWithSources(defaults, []),
    quietHours: null,
    globalPolicies: [],
    ...overrides,
  };
}

const baseRequest = {
  userId: 'u1',
  notificationType: 'marketing_email' as const,
  channel: 'email' as const,
  region: 'US' as const,
  datetime: '2026-05-21T12:00:00Z',
};

describe('Business rules (assignment §3)', () => {
  it('documents evaluation order', () => {
    expect(EVALUATION_RULE_ORDER).toEqual([
      'user_exists',
      'type_channel_match',
      'global_policy',
      'effective_preference',
      'quiet_hours',
    ]);
  });

  it('denies by default when marketing is off in defaults', () => {
    const result = evaluateNotification(baseRequest, ctx());
    expect(result).toEqual({
      decision: 'deny',
      reason: 'disabled_by_default',
    });
  });

  it('allows when user overrides default to enabled', () => {
    const preferences = mergePreferencesWithSources(defaults, [
      {
        notificationType: 'marketing_email',
        channel: 'email',
        enabled: true,
      },
    ]);
    const result = evaluateNotification(baseRequest, ctx({ preferences }));
    expect(result).toEqual({ decision: 'allow' });
  });

  it('global policy denies even when user enabled preference', () => {
    const preferences = mergePreferencesWithSources(defaults, [
      { notificationType: 'marketing_sms', channel: 'sms', enabled: true },
    ]);
    const result = evaluateNotification(
      {
        userId: 'u1',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        datetime: '2026-05-21T12:00:00Z',
      },
      ctx({
        preferences,
        globalPolicies: [
          {
            notificationType: 'marketing_sms',
            channel: 'sms',
            region: 'EU',
            deny: true,
          },
        ],
      }),
    );
    expect(result.reason).toBe('blocked_by_global_policy');
  });

  it('applies quiet hours in user timezone', () => {
    const preferences = mergePreferencesWithSources(defaults, [
      { notificationType: 'marketing_push', channel: 'push', enabled: true },
    ]);
    const quietHours: QuietHours = {
      timezone: 'Europe/Moscow',
      start: '22:00',
      end: '08:00',
    };
    const duringQuiet = evaluateNotification(
      {
        userId: 'u1',
        notificationType: 'marketing_push',
        channel: 'push',
        region: 'RU',
        datetime: '2026-05-21T20:30:00Z',
      },
      ctx({ preferences, quietHours }),
    );
    expect(duringQuiet).toEqual({
      decision: 'deny',
      reason: 'blocked_by_quiet_hours',
    });

    const transactional = evaluateNotification(
      {
        userId: 'u1',
        notificationType: 'transactional_push',
        channel: 'push',
        region: 'RU',
        datetime: '2026-05-21T20:30:00Z',
      },
      ctx({
        preferences: mergePreferencesWithSources(
          [
            ...defaults,
            {
              notificationType: 'transactional_push',
              channel: 'push',
              enabled: true,
            },
          ],
          [],
        ),
        quietHours,
      }),
    );
    expect(transactional.decision).toBe('allow');
  });
});
