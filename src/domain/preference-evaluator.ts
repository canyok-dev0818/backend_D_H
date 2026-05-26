import { typesMatchChannel } from './notification-meta.js';
import { isQuietHoursApplicable, isWithinQuietHours } from './quiet-hours.js';
import type {
  DenyReason,
  EvaluateRequest,
  EvaluateResult,
  GlobalPolicy,
  PreferenceEntry,
  QuietHours,
} from './types.js';

export interface EvaluationContext {
  preferences: PreferenceEntry[];
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
    const reason: DenyReason = pref
      ? 'disabled_by_user_preference'
      : 'disabled_by_default';
    return { decision: 'deny', reason };
  }

  if (context.quietHours) {
    const instant = new Date(request.datetime);
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
  const map = new Map<string, PreferenceEntry>();
  for (const d of defaults) {
    map.set(key(d), { ...d });
  }
  for (const o of overrides) {
    map.set(key(o), { ...o });
  }
  return Array.from(map.values());
}

function key(p: PreferenceEntry): string {
  return `${p.notificationType}:${p.channel}`;
}
