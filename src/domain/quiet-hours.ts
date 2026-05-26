import {
  getLocalTimeParts,
  parseLocalTimeToMinutes,
} from './datetime.js';
import {
  categoryForNotificationType,
  DEFAULT_MARKETING_BLOCKED_DURING_QUIET,
} from './notification-meta.js';
import type { NotificationType, QuietHours } from './types.js';

/**
 * Returns true when `instant` falls inside quiet hours in the user's timezone.
 * Supports overnight windows (e.g. 22:00–08:00).
 */
export function isWithinQuietHours(
  quietHours: QuietHours,
  instant: Date,
  notificationType: NotificationType,
): boolean {
  const blocked =
    quietHours.blockedTypes ?? DEFAULT_MARKETING_BLOCKED_DURING_QUIET;
  if (!blocked.includes(notificationType)) {
    return false;
  }

  const parts = getLocalTimeParts(instant, quietHours.timezone);
  const currentMinutes = parts.hour * 60 + parts.minute;
  const startMinutes = parseLocalTimeToMinutes(quietHours.start);
  const endMinutes = parseLocalTimeToMinutes(quietHours.end);

  if (startMinutes === endMinutes) {
    return false;
  }

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  // Overnight: e.g. 22:00 – 08:00
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

/** Transactional notifications bypass quiet hours by default */
export function isQuietHoursApplicable(
  notificationType: NotificationType,
  quietHours: QuietHours,
): boolean {
  const blocked =
    quietHours.blockedTypes ?? DEFAULT_MARKETING_BLOCKED_DURING_QUIET;
  if (blocked.includes(notificationType)) {
    return true;
  }
  return categoryForNotificationType(notificationType) === 'marketing';
}
