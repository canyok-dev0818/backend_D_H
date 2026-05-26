/**
 * Date/time helpers for the domain layer.
 * - Evaluate requests use ISO-8601 instants (UTC Z or offset).
 * - Quiet hours use IANA timezones and local HH:mm wall-clock times.
 */

/** Parse evaluate `datetime` field; throws if not a valid instant */
export function parseIsoInstant(iso: string): Date {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid ISO-8601 datetime: ${iso}`);
  }
  return new Date(ms);
}

export function isValidIanaTimezone(timezone: string): boolean {
  if (!timezone.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Local wall-clock hour/minute for an instant in the given IANA timezone */
export function getLocalTimeParts(
  instant: Date,
  timezone: string,
): { hour: number; minute: number } {
  if (!isValidIanaTimezone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
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

/** Parse HH:mm (24h) to minutes since midnight */
export function parseLocalTimeToMinutes(time: string): number {
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
