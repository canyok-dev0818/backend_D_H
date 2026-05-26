import type pg from 'pg';
import type {
  GlobalPolicy,
  PreferenceEntry,
  QuietHours,
  UpdatePreferencesCommand,
} from '../../domain/types.js';
import type { Channel, NotificationType } from '../../domain/types.js';

export class PreferencesRepository {
  constructor(private readonly pool: pg.Pool) {}

  async ensureUser(userId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [userId],
    );
  }

  async userExists(userId: string): Promise<boolean> {
    const res = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1) AS exists`,
      [userId],
    );
    return res.rows[0]?.exists ?? false;
  }

  async getDefaultPreferences(): Promise<PreferenceEntry[]> {
    const res = await this.pool.query<{
      notification_type: string;
      channel: string;
      enabled: boolean;
    }>(`SELECT notification_type, channel, enabled FROM default_preferences`);
    return res.rows.map(rowToPreference);
  }

  async getUserPreferenceOverrides(userId: string): Promise<PreferenceEntry[]> {
    const res = await this.pool.query<{
      notification_type: string;
      channel: string;
      enabled: boolean;
    }>(
      `SELECT notification_type, channel, enabled FROM user_preferences WHERE user_id = $1`,
      [userId],
    );
    return res.rows.map(rowToPreference);
  }

  async upsertUserPreference(
    userId: string,
    notificationType: NotificationType,
    channel: Channel,
    enabled: boolean,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_preferences (user_id, notification_type, channel, enabled, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, notification_type, channel)
       DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
      [userId, notificationType, channel, enabled],
    );
  }

  async getUserQuietHours(userId: string): Promise<QuietHours | null> {
    const res = await this.pool.query<{
      timezone: string;
      start_time: string;
      end_time: string;
      blocked_types: NotificationType[] | null;
    }>(
      `SELECT timezone, start_time, end_time, blocked_types FROM user_quiet_hours WHERE user_id = $1`,
      [userId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      timezone: row.timezone,
      start: row.start_time,
      end: row.end_time,
      blockedTypes: row.blocked_types ?? undefined,
    };
  }

  async setUserQuietHours(userId: string, quietHours: QuietHours): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_quiet_hours (user_id, timezone, start_time, end_time, blocked_types, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         timezone = EXCLUDED.timezone,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         blocked_types = EXCLUDED.blocked_types,
         updated_at = NOW()`,
      [
        userId,
        quietHours.timezone,
        quietHours.start,
        quietHours.end,
        quietHours.blockedTypes
          ? JSON.stringify(quietHours.blockedTypes)
          : null,
      ],
    );
  }

  async deleteUserQuietHours(userId: string): Promise<void> {
    await this.pool.query(`DELETE FROM user_quiet_hours WHERE user_id = $1`, [
      userId,
    ]);
  }

  async getGlobalPolicies(): Promise<GlobalPolicy[]> {
    const res = await this.pool.query<{
      id: number;
      notification_type: string;
      channel: string;
      region: string;
      deny: boolean;
    }>(
      `SELECT id, notification_type, channel, region, deny FROM global_policies WHERE deny = true`,
    );
    return res.rows.map((r) => ({
      id: r.id,
      notificationType: r.notification_type as GlobalPolicy['notificationType'],
      channel: r.channel as GlobalPolicy['channel'],
      region: r.region as GlobalPolicy['region'],
      deny: r.deny,
    }));
  }

  async wasCommandApplied(
    userId: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM preference_commands WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    return res.rowCount !== null && res.rowCount > 0;
  }

  async recordCommand(
    userId: string,
    idempotencyKey: string,
    command: UpdatePreferencesCommand,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO preference_commands (user_id, idempotency_key, command)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, idempotency_key) DO NOTHING`,
      [userId, idempotencyKey, JSON.stringify(command)],
    );
  }
}

function rowToPreference(row: {
  notification_type: string;
  channel: string;
  enabled: boolean;
}): PreferenceEntry {
  return {
    notificationType: row.notification_type as PreferenceEntry['notificationType'],
    channel: row.channel as PreferenceEntry['channel'],
    enabled: row.enabled,
  };
}
