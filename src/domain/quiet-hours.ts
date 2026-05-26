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
  const startMinutes = parseTimeToMinutes(quietHours.start);
  const endMinutes = parseTimeToMinutes(quietHours.end);

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

function parseTimeToMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) {
    throw new Error(`Invalid time format: ${time}, expected HH:mm`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new Error(`Invalid time: ${time}`);
  }
  return hour * 60 + minute;
}

function getLocalTimeParts(
  instant: Date,
  timezone: string,
): { hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(instant);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { hour, minute };
}
