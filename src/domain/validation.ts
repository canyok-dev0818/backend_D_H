import {
  CHANNELS,
  NOTIFICATION_TYPES,
  REGIONS,
  type Channel,
  type EvaluateRequest,
  type NotificationType,
  type Region,
  type UpdatePreferencesCommand,
} from './types.js';
import { isValidIanaTimezone, parseIsoInstant } from './datetime.js';
import { typesMatchChannel } from './notification-meta.js';

export function assertNotificationType(value: string): NotificationType {
  if (!(NOTIFICATION_TYPES as readonly string[]).includes(value)) {
    throw new ValidationError(`Unknown notificationType: ${value}`);
  }
  return value as NotificationType;
}

export function assertChannel(value: string): Channel {
  if (!(CHANNELS as readonly string[]).includes(value)) {
    throw new ValidationError(`Unknown channel: ${value}`);
  }
  return value as Channel;
}

export function assertRegion(value: string): Region {
  if (!(REGIONS as readonly string[]).includes(value)) {
    throw new ValidationError(`Unknown region: ${value}`);
  }
  return value as Region;
}

export function validateEvaluateRequest(body: unknown): EvaluateRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be an object');
  }
  const b = body as Record<string, unknown>;

  const userId = String(b.userId ?? '').trim();
  if (!userId) {
    throw new ValidationError('userId is required');
  }

  const notificationType = assertNotificationType(
    String(b.notificationType ?? ''),
  );
  const channel = assertChannel(String(b.channel ?? ''));
  if (!typesMatchChannel(notificationType, channel)) {
    throw new ValidationError(
      `notificationType ${notificationType} does not match channel ${channel}`,
    );
  }

  const region = assertRegion(String(b.region ?? ''));
  const datetime = String(b.datetime ?? '');
  if (!datetime) {
    throw new ValidationError('datetime is required');
  }
  try {
    parseIsoInstant(datetime);
  } catch {
    throw new ValidationError('datetime must be valid ISO-8601');
  }

  return { userId, notificationType, channel, region, datetime };
}

export function validateUpdateCommand(
  body: unknown,
): UpdatePreferencesCommand {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be an object');
  }
  const cmd = body as Record<string, unknown>;
  const result: UpdatePreferencesCommand = {};

  if (cmd.setPreference !== undefined) {
    const sp = cmd.setPreference;
    if (!sp || typeof sp !== 'object') {
      throw new ValidationError('setPreference must be an object');
    }
    const pref = sp as Record<string, unknown>;
    const notificationType = assertNotificationType(
      String(pref.notificationType),
    );
    const channel = assertChannel(String(pref.channel));
    if (!typesMatchChannel(notificationType, channel)) {
      throw new ValidationError(
        `notificationType ${notificationType} does not match channel ${channel}`,
      );
    }
    if (typeof pref.enabled !== 'boolean') {
      throw new ValidationError('setPreference.enabled must be a boolean');
    }
    result.setPreference = { notificationType, channel, enabled: pref.enabled };
  }

  if (cmd.quietHours !== undefined) {
    if (cmd.quietHours === null) {
      result.quietHours = null;
    } else {
      result.quietHours = parseQuietHours(cmd.quietHours);
    }
  }

  if (!result.setPreference && result.quietHours === undefined) {
    throw new ValidationError(
      'At least one of setPreference or quietHours is required',
    );
  }

  return result;
}

function parseQuietHours(value: unknown) {
  if (!value || typeof value !== 'object') {
    throw new ValidationError('quietHours must be an object');
  }
  const q = value as Record<string, unknown>;
  const timezone = String(q.timezone ?? '');
  if (!timezone) {
    throw new ValidationError('quietHours.timezone is required');
  }
  if (!isValidIanaTimezone(timezone)) {
    throw new ValidationError(`Invalid timezone: ${timezone}`);
  }
  const start = String(q.start ?? '');
  const end = String(q.end ?? '');
  if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) {
    throw new ValidationError('quietHours.start/end must be HH:mm');
  }
  const blockedTypes = q.blockedTypes;
  let parsedBlocked: NotificationType[] | undefined;
  if (blockedTypes !== undefined) {
    if (!Array.isArray(blockedTypes)) {
      throw new ValidationError('quietHours.blockedTypes must be an array');
    }
    parsedBlocked = blockedTypes.map((t) => assertNotificationType(String(t)));
  }
  return {
    timezone,
    start,
    end,
    blockedTypes: parsedBlocked,
  };
}

export class ValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
