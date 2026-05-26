/** Notification delivery channel */
export type Channel = 'email' | 'sms' | 'push' | 'messenger';

/** Geographic / regulatory region for global policies */
export type Region = 'EU' | 'US' | 'RU' | 'GLOBAL';

/**
 * Composite notification identifier (type + channel baked into name per assignment examples).
 * e.g. transactional_email, marketing_sms
 */
export type NotificationType =
  | 'transactional_email'
  | 'marketing_email'
  | 'transactional_sms'
  | 'marketing_sms'
  | 'transactional_push'
  | 'marketing_push'
  | 'transactional_messenger'
  | 'marketing_messenger';

export type NotificationCategory = 'transactional' | 'marketing';

export interface PreferenceEntry {
  notificationType: NotificationType;
  channel: Channel;
  enabled: boolean;
}

/** Effective preference with origin: system default or user override */
export interface PreferenceEntryWithSource extends PreferenceEntry {
  source: 'default' | 'user';
}

export interface QuietHours {
  timezone: string;
  /** Local time HH:mm (24h) */
  start: string;
  /** Local time HH:mm (24h) */
  end: string;
  /** Notification types blocked during quiet hours; defaults to all marketing_* */
  blockedTypes?: NotificationType[];
}

export interface GlobalPolicy {
  id?: number;
  notificationType: NotificationType;
  channel: Channel;
  region: Region;
  /** When true, sending is forbidden in this region */
  deny: boolean;
}

export interface UserPreferencesSnapshot {
  userId: string;
  preferences: PreferenceEntryWithSource[];
  quietHours: QuietHours | null;
}

export type EvaluateDecision = 'allow' | 'deny';

export type DenyReason =
  | 'blocked_by_global_policy'
  | 'disabled_by_user_preference'
  | 'disabled_by_default'
  | 'blocked_by_quiet_hours'
  | 'user_not_found';

export interface EvaluateRequest {
  userId: string;
  notificationType: NotificationType;
  channel: Channel;
  region: Region;
  /** ISO-8601 instant */
  datetime: string;
}

export interface EvaluateResult {
  decision: EvaluateDecision;
  reason?: DenyReason | string;
}

export interface UpdatePreferencesCommand {
  /** Toggle a single type+channel */
  setPreference?: {
    notificationType: NotificationType;
    channel: Channel;
    enabled: boolean;
  };
  quietHours?: QuietHours | null;
}

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'transactional_email',
  'marketing_email',
  'transactional_sms',
  'marketing_sms',
  'transactional_push',
  'marketing_push',
  'transactional_messenger',
  'marketing_messenger',
] as const;

export const CHANNELS: readonly Channel[] = [
  'email',
  'sms',
  'push',
  'messenger',
] as const;

export const REGIONS: readonly Region[] = ['EU', 'US', 'RU', 'GLOBAL'] as const;
