import { parseIsoInstant } from './datetime.js';
import { typesMatchChannel } from './notification-meta.js';
import { isQuietHoursApplicable, isWithinQuietHours } from './quiet-hours.js';
import type {
  DenyReason,
  EvaluateRequest,
  EvaluateResult,
  GlobalPolicy,
  PreferenceEntry,
  PreferenceEntryWithSource,
  QuietHours,
} from './types.js';

/**
 * Business rule evaluation order (assignment §3):
 * 1. User must exist
 * 2. notificationType ↔ channel consistency
 * 3. Global policy (type + channel + region) — overrides user/default
 * 4. Effective preference (user override > default)
 * 5. Quiet hours in user's timezone — only if step 4 allowed send
 */
export const EVALUATION_RULE_ORDER = [
  'user_exists',
  'type_channel_match',
  'global_policy',
  'effective_preference',
  'quiet_hours',
] as const;

export interface EvaluationContext {
  preferences: PreferenceEntryWithSource[];
  quietHours: QuietHours | null;
  globalPolicies: GlobalPolicy[];
  userExists: boolean;
}

export function evaluateNotification(
  request: EvaluateRequest,
  context: EvaluationContext,
): EvaluateResult {
  if (!context.userExists) {
    return { decision: 'deny', reason: 'user_not_found' };
  }

  if (!typesMatchChannel(request.notificationType, request.channel)) {
    return {
      decision: 'deny',
      reason: 'notification_type_channel_mismatch',
    };
  }

  const globalDeny = findGlobalDeny(
    context.globalPolicies,
    request.notificationType,
    request.channel,
    request.region,
  );
  if (globalDeny) {
    return { decision: 'deny', reason: 'blocked_by_global_policy' };
  }

  const pref = context.preferences.find(
    (p) =>
      p.notificationType === request.notificationType &&
      p.channel === request.channel,
  );

  if (!pref?.enabled) {
    const reason: DenyReason =
      pref?.source === 'user'
        ? 'disabled_by_user_preference'
        : 'disabled_by_default';
    return { decision: 'deny', reason };
  }

  if (context.quietHours) {
    const instant = parseIsoInstant(request.datetime);
    if (
      isQuietHoursApplicable(request.notificationType, context.quietHours) &&
      isWithinQuietHours(
        context.quietHours,
        instant,
        request.notificationType,
      )
    ) {
      return { decision: 'deny', reason: 'blocked_by_quiet_hours' };
    }
  }

  return { decision: 'allow' };
}

function findGlobalDeny(
  policies: GlobalPolicy[],
  notificationType: EvaluateRequest['notificationType'],
  channel: EvaluateRequest['channel'],
  region: EvaluateRequest['region'],
): boolean {
  return policies.some(
    (p) =>
      p.deny &&
      p.notificationType === notificationType &&
      p.channel === channel &&
      (p.region === region || p.region === 'GLOBAL'),
  );
}

export function mergePreferencesWithDefaults(
  defaults: PreferenceEntry[],
  overrides: PreferenceEntry[],
): PreferenceEntry[] {
  return mergePreferencesWithSources(defaults, overrides).map(
    ({ source: _s, ...entry }) => entry,
  );
}

export function mergePreferencesWithSources(
  defaults: PreferenceEntry[],
  overrides: PreferenceEntry[],
): PreferenceEntryWithSource[] {
  const map = new Map<string, PreferenceEntryWithSource>();

  for (const d of defaults) {
    map.set(key(d), { ...d, source: 'default' });
  }
  for (const o of overrides) {
    map.set(key(o), { ...o, source: 'user' });
  }

  return Array.from(map.values());
}

function key(p: PreferenceEntry): string {
  return `${p.notificationType}:${p.channel}`;
}
