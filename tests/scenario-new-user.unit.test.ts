import { describe, expect, it } from 'vitest';
import { mergePreferencesWithSources } from '../src/domain/preference-evaluator.js';
import type { PreferenceEntry } from '../src/domain/types.js';

const systemDefaults: PreferenceEntry[] = [
  { notificationType: 'transactional_email', channel: 'email', enabled: true },
  { notificationType: 'marketing_email', channel: 'email', enabled: false },
  { notificationType: 'transactional_sms', channel: 'sms', enabled: true },
  { notificationType: 'marketing_sms', channel: 'sms', enabled: false },
  { notificationType: 'transactional_push', channel: 'push', enabled: true },
  { notificationType: 'marketing_push', channel: 'push', enabled: false },
  { notificationType: 'transactional_messenger', channel: 'messenger', enabled: true },
  { notificationType: 'marketing_messenger', channel: 'messenger', enabled: false },
];

describe('Scenario 1: New user and defaults (unit)', () => {
  it('merges empty user overrides into full default set', () => {
    const effective = mergePreferencesWithSources(systemDefaults, []);
    expect(effective).toHaveLength(8);
    expect(effective.every((p) => p.source === 'default')).toBe(true);

    const transactional = effective.find(
      (p) => p.notificationType === 'transactional_email',
    );
    const marketing = effective.find(
      (p) => p.notificationType === 'marketing_email',
    );

    expect(transactional?.enabled).toBe(true);
    expect(marketing?.enabled).toBe(false);
  });
});
