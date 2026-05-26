import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import {
  closeTestPool,
  getTestPool,
  resetDatabase,
} from './setup.js';

describe('Notification Preferences Service', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const pool = getTestPool();
    await runMigrationsSafe(pool);
    app = await buildServer(pool);
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    if (app) await app.close();
    await closeTestPool();
  });

  describe('API requirements (assignment §2)', () => {
    it('GET /users/:id/preferences returns current effective settings', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/users/api-get-user/preferences',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({
        userId: 'api-get-user',
        preferences: expect.any(Array),
        quietHours: null,
      });
      expect(body.preferences[0]).toHaveProperty('notificationType');
      expect(body.preferences[0]).toHaveProperty('channel');
      expect(body.preferences[0]).toHaveProperty('enabled');
      expect(body.preferences[0]).toHaveProperty('source');
    });

    it('POST toggles notification type by channel', async () => {
      await app.inject({
        method: 'POST',
        url: '/users/api-post-user/preferences',
        headers: { 'idempotency-key': 'api-toggle-1' },
        payload: {
          setPreference: {
            notificationType: 'marketing_push',
            channel: 'push',
            enabled: true,
          },
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/users/api-post-user/preferences',
      });
      const push = res.json().preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'marketing_push',
      );
      expect(push?.enabled).toBe(true);
      expect(push?.source).toBe('user');
    });

    it('POST sets quiet hours with timezone', async () => {
      const post = await app.inject({
        method: 'POST',
        url: '/users/api-qh-user/preferences',
        headers: { 'idempotency-key': 'api-qh-1' },
        payload: {
          quietHours: {
            timezone: 'Asia/Tokyo',
            start: '22:00',
            end: '08:00',
          },
        },
      });
      expect(post.statusCode).toBe(200);
      expect(post.json().quietHours).toEqual({
        timezone: 'Asia/Tokyo',
        start: '22:00',
        end: '08:00',
      });
    });

    it('POST /evaluate returns allow/deny with reason on deny (assignment format)', async () => {
      await app.inject({
        method: 'GET',
        url: '/users/user-eu/preferences',
      });

      const deny = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId: 'user-eu',
          notificationType: 'marketing_sms',
          channel: 'sms',
          region: 'EU',
          datetime: '2026-05-21T21:30:00Z',
        },
      });
      expect(deny.statusCode).toBe(200);
      expect(deny.json()).toEqual({
        decision: 'deny',
        reason: 'blocked_by_global_policy',
      });

      const allow = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId: 'user-eu',
          notificationType: 'transactional_email',
          channel: 'email',
          region: 'EU',
          datetime: '2026-05-21T21:30:00Z',
        },
      });
      expect(allow.json()).toEqual({ decision: 'allow' });
    });

    it('POST /evaluate returns 400 when required fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: { notificationType: 'marketing_email', channel: 'email' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBeTruthy();
    });
  });

  describe('0. Storage layers (defaults, user, policies)', () => {
    it('exposes all three storage types via API', async () => {
      const defaults = await app.inject({ method: 'GET', url: '/defaults' });
      expect(defaults.statusCode).toBe(200);
      expect(defaults.json().preferences.length).toBeGreaterThan(0);

      const policies = await app.inject({ method: 'GET', url: '/policies' });
      expect(policies.statusCode).toBe(200);
      const euPolicy = policies.json().policies.find(
        (p: { notificationType: string; region: string }) =>
          p.notificationType === 'marketing_sms' && p.region === 'EU',
      );
      expect(euPolicy?.deny).toBe(true);

      await app.inject({
        method: 'POST',
        url: '/users/user-storage/preferences',
        headers: { 'idempotency-key': 'storage-user-1' },
        payload: {
          setPreference: {
            notificationType: 'marketing_email',
            channel: 'email',
            enabled: true,
          },
        },
      });

      const userPrefs = await app.inject({
        method: 'GET',
        url: '/users/user-storage/preferences',
      });
      const marketing = userPrefs.json().preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'marketing_email',
      );
      expect(marketing?.source).toBe('user');
      expect(marketing?.enabled).toBe(true);

      const transactional = userPrefs.json().preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'transactional_email',
      );
      expect(transactional?.source).toBe('default');
    });
  });

  describe('Business rules (assignment §3)', () => {
    it('evaluate uses disabled_by_default for marketing off by default', async () => {
      await app.inject({
        method: 'GET',
        url: '/users/br-defaults/preferences',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId: 'br-defaults',
          notificationType: 'marketing_email',
          channel: 'email',
          region: 'US',
          datetime: '2026-05-21T12:00:00Z',
        },
      });
      expect(res.json()).toEqual({
        decision: 'deny',
        reason: 'disabled_by_default',
      });
    });

    it('idempotent quiet hours update applies once', async () => {
      const body = {
        quietHours: { timezone: 'UTC', start: '23:00', end: '07:00' },
      };
      const key = 'idem-quiet-hours';

      await app.inject({
        method: 'POST',
        url: '/users/br-idem-qh/preferences',
        headers: { 'idempotency-key': key },
        payload: body,
      });
      await app.inject({
        method: 'POST',
        url: '/users/br-idem-qh/preferences',
        headers: { 'idempotency-key': key },
        payload: body,
      });

      const pool = getTestPool();
      const count = await pool.query(
        `SELECT COUNT(*)::int AS c FROM preference_commands WHERE user_id = $1 AND idempotency_key = $2`,
        ['br-idem-qh', key],
      );
      expect(count.rows[0].c).toBe(1);

      const prefs = await app.inject({
        method: 'GET',
        url: '/users/br-idem-qh/preferences',
      });
      expect(prefs.json().quietHours.timezone).toBe('UTC');
    });
  });

  describe('Scenario 1: New user and defaults', () => {
    it('creates user on first GET with full default preference set', async () => {
      const userId = 'scenario1-new-user';
      const pool = getTestPool();

      const beforeUser = await pool.query(
        `SELECT 1 FROM users WHERE id = $1`,
        [userId],
      );
      expect(beforeUser.rowCount).toBe(0);

      const res = await app.inject({
        method: 'GET',
        url: `/users/${userId}/preferences`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.userId).toBe(userId);
      expect(body.quietHours).toBeNull();

      const afterUser = await pool.query(
        `SELECT 1 FROM users WHERE id = $1`,
        [userId],
      );
      expect(afterUser.rowCount).toBe(1);

      const overrides = await pool.query(
        `SELECT 1 FROM user_preferences WHERE user_id = $1`,
        [userId],
      );
      expect(overrides.rowCount).toBe(0);

      expect(body.preferences).toHaveLength(8);
      expect(
        body.preferences.every(
          (p: { source: string }) => p.source === 'default',
        ),
      ).toBe(true);

      const transactional = body.preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'transactional_email',
      );
      const marketing = body.preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'marketing_email',
      );

      expect(transactional).toMatchObject({
        channel: 'email',
        enabled: true,
        source: 'default',
      });
      expect(marketing).toMatchObject({
        channel: 'email',
        enabled: false,
        source: 'default',
      });
    });

    it('evaluate applies defaults for newly provisioned user (no overrides)', async () => {
      const userId = 'scenario1-eval-only';

      const allowTransactional = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId,
          notificationType: 'transactional_email',
          channel: 'email',
          region: 'US',
          datetime: '2026-05-21T12:00:00Z',
        },
      });
      expect(allowTransactional.json()).toEqual({ decision: 'allow' });

      const denyMarketing = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId,
          notificationType: 'marketing_email',
          channel: 'email',
          region: 'US',
          datetime: '2026-05-21T12:00:00Z',
        },
      });
      expect(denyMarketing.json()).toEqual({
        decision: 'deny',
        reason: 'disabled_by_default',
      });

      const prefs = await app.inject({
        method: 'GET',
        url: `/users/${userId}/preferences`,
      });
      expect(
        prefs.json().preferences.every(
          (p: { source: string }) => p.source === 'default',
        ),
      ).toBe(true);
    });
  });

  describe('Scenario 2: User changes preferences', () => {
    it('opt-out of marketing email is reflected in GET; transactional email stays allowed', async () => {
      const userId = 'scenario2-user';
      const pool = getTestPool();

      await app.inject({
        method: 'GET',
        url: `/users/${userId}/preferences`,
      });

      const disable = await app.inject({
        method: 'POST',
        url: `/users/${userId}/preferences`,
        headers: { 'idempotency-key': 'scenario2-disable-marketing' },
        payload: {
          setPreference: {
            notificationType: 'marketing_email',
            channel: 'email',
            enabled: false,
          },
        },
      });
      expect(disable.statusCode).toBe(200);

      const postBody = disable.json();
      const postMarketing = postBody.preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'marketing_email',
      );
      const postTransactional = postBody.preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'transactional_email',
      );
      expect(postMarketing).toMatchObject({
        enabled: false,
        source: 'user',
      });
      expect(postTransactional).toMatchObject({
        enabled: true,
        source: 'default',
      });

      const prefs = await app.inject({
        method: 'GET',
        url: `/users/${userId}/preferences`,
      });
      const marketing = prefs.json().preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'marketing_email',
      );
      const transactional = prefs.json().preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'transactional_email',
      );

      expect(marketing).toMatchObject({
        channel: 'email',
        enabled: false,
        source: 'user',
      });
      expect(transactional).toMatchObject({
        channel: 'email',
        enabled: true,
        source: 'default',
      });

      const dbOverride = await pool.query<{
        notification_type: string;
        enabled: boolean;
      }>(
        `SELECT notification_type, enabled FROM user_preferences
         WHERE user_id = $1 AND notification_type = 'marketing_email'`,
        [userId],
      );
      expect(dbOverride.rowCount).toBe(1);
      expect(dbOverride.rows[0].enabled).toBe(false);

      const allowTransactional = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId,
          notificationType: 'transactional_email',
          channel: 'email',
          region: 'US',
          datetime: '2026-05-21T12:00:00Z',
        },
      });
      expect(allowTransactional.json()).toEqual({ decision: 'allow' });

      const denyMarketing = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId,
          notificationType: 'marketing_email',
          channel: 'email',
          region: 'US',
          datetime: '2026-05-21T12:00:00Z',
        },
      });
      expect(denyMarketing.json()).toEqual({
        decision: 'deny',
        reason: 'disabled_by_user_preference',
      });
    });

    it('disabling marketing after enabling it still leaves transactional allowed', async () => {
      const userId = 'scenario2-toggle-user';

      await app.inject({
        method: 'POST',
        url: `/users/${userId}/preferences`,
        headers: { 'idempotency-key': 's2-enable' },
        payload: {
          setPreference: {
            notificationType: 'marketing_email',
            channel: 'email',
            enabled: true,
          },
        },
      });

      await app.inject({
        method: 'POST',
        url: `/users/${userId}/preferences`,
        headers: { 'idempotency-key': 's2-disable' },
        payload: {
          setPreference: {
            notificationType: 'marketing_email',
            channel: 'email',
            enabled: false,
          },
        },
      });

      const prefs = await app.inject({
        method: 'GET',
        url: `/users/${userId}/preferences`,
      });
      const marketing = prefs.json().preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'marketing_email',
      );
      const transactional = prefs.json().preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'transactional_email',
      );

      expect(marketing?.enabled).toBe(false);
      expect(transactional?.enabled).toBe(true);

      const evalTx = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId,
          notificationType: 'transactional_email',
          channel: 'email',
          region: 'US',
          datetime: '2026-05-21T12:00:00Z',
        },
      });
      expect(evalTx.json().decision).toBe('allow');
    });
  });

  describe('Scenario 3: Quiet hours', () => {
    it('stores 22:00–08:00 in user timezone and blocks marketing push only during window', async () => {
      const userId = 'scenario3-user';
      const pool = getTestPool();

      const setup = await app.inject({
        method: 'POST',
        url: `/users/${userId}/preferences`,
        headers: { 'idempotency-key': 'scenario3-qh-setup' },
        payload: {
          setPreference: {
            notificationType: 'marketing_push',
            channel: 'push',
            enabled: true,
          },
          quietHours: {
            timezone: 'Europe/Moscow',
            start: '22:00',
            end: '08:00',
          },
        },
      });
      expect(setup.statusCode).toBe(200);
      expect(setup.json().quietHours).toEqual({
        timezone: 'Europe/Moscow',
        start: '22:00',
        end: '08:00',
      });

      const prefs = await app.inject({
        method: 'GET',
        url: `/users/${userId}/preferences`,
      });
      expect(prefs.json().quietHours).toEqual({
        timezone: 'Europe/Moscow',
        start: '22:00',
        end: '08:00',
      });

      const dbQh = await pool.query<{
        timezone: string;
        start_time: string;
        end_time: string;
      }>(
        `SELECT timezone, start_time, end_time FROM user_quiet_hours WHERE user_id = $1`,
        [userId],
      );
      expect(dbQh.rowCount).toBe(1);
      expect(dbQh.rows[0]).toEqual({
        timezone: 'Europe/Moscow',
        start_time: '22:00',
        end_time: '08:00',
      });

      // 2026-05-21T20:30:00Z = 23:30 MSK (UTC+3)
      const duringQuiet = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId,
          notificationType: 'marketing_push',
          channel: 'push',
          region: 'RU',
          datetime: '2026-05-21T20:30:00Z',
        },
      });
      expect(duringQuiet.json()).toEqual({
        decision: 'deny',
        reason: 'blocked_by_quiet_hours',
      });

      const transactionalDuringQuiet = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId,
          notificationType: 'transactional_push',
          channel: 'push',
          region: 'RU',
          datetime: '2026-05-21T20:30:00Z',
        },
      });
      expect(transactionalDuringQuiet.json()).toEqual({ decision: 'allow' });

      // 2026-05-21T10:00:00Z = 13:00 MSK — outside quiet hours
      const outsideQuiet = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId,
          notificationType: 'marketing_push',
          channel: 'push',
          region: 'RU',
          datetime: '2026-05-21T10:00:00Z',
        },
      });
      expect(outsideQuiet.json()).toEqual({ decision: 'allow' });
    });

    it('quiet hours can be set without changing other preferences', async () => {
      const userId = 'scenario3-qh-only';

      await app.inject({
        method: 'GET',
        url: `/users/${userId}/preferences`,
      });

      await app.inject({
        method: 'POST',
        url: `/users/${userId}/preferences`,
        headers: { 'idempotency-key': 'scenario3-qh-only' },
        payload: {
          quietHours: {
            timezone: 'Asia/Tokyo',
            start: '22:00',
            end: '08:00',
          },
        },
      });

      const prefs = await app.inject({
        method: 'GET',
        url: `/users/${userId}/preferences`,
      });
      expect(prefs.json().quietHours?.timezone).toBe('Asia/Tokyo');

      const push = prefs.json().preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'marketing_push',
      );
      expect(push?.enabled).toBe(false);
      expect(push?.source).toBe('default');
    });
  });

  describe('Scenario 4: Global policies', () => {
    it('marketing_sms is denied in EU even when user enabled it; allowed in US', async () => {
      const userId = 'scenario4-user';

      const policies = await app.inject({ method: 'GET', url: '/policies' });
      const euPolicy = policies.json().policies.find(
        (p: {
          notificationType: string;
          channel: string;
          region: string;
        }) =>
          p.notificationType === 'marketing_sms' &&
          p.channel === 'sms' &&
          p.region === 'EU',
      );
      expect(euPolicy).toMatchObject({
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        deny: true,
      });

      await app.inject({
        method: 'POST',
        url: `/users/${userId}/preferences`,
        headers: { 'idempotency-key': 'scenario4-enable-sms' },
        payload: {
          setPreference: {
            notificationType: 'marketing_sms',
            channel: 'sms',
            enabled: true,
          },
        },
      });

      const prefs = await app.inject({
        method: 'GET',
        url: `/users/${userId}/preferences`,
      });
      const sms = prefs.json().preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'marketing_sms',
      );
      expect(sms?.enabled).toBe(true);
      expect(sms?.source).toBe('user');

      const euDeny = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId,
          notificationType: 'marketing_sms',
          channel: 'sms',
          region: 'EU',
          datetime: '2026-05-21T21:30:00Z',
        },
      });
      expect(euDeny.json()).toEqual({
        decision: 'deny',
        reason: 'blocked_by_global_policy',
      });

      const usAllow = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId,
          notificationType: 'marketing_sms',
          channel: 'sms',
          region: 'US',
          datetime: '2026-05-21T21:30:00Z',
        },
      });
      expect(usAllow.json()).toEqual({ decision: 'allow' });
    });

    it('global policy does not block other types in the same region', async () => {
      const userId = 'scenario4-tx-user';

      await app.inject({
        method: 'GET',
        url: `/users/${userId}/preferences`,
      });

      const transactionalEu = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId,
          notificationType: 'transactional_sms',
          channel: 'sms',
          region: 'EU',
          datetime: '2026-05-21T21:30:00Z',
        },
      });
      expect(transactionalEu.json()).toEqual({ decision: 'allow' });
    });
  });

  describe('Scenario 5: Idempotency', () => {
    it('disabling marketing_email twice with same key matches single disable (assignment example)', async () => {
      const userId = 'scenario5-user';
      const pool = getTestPool();
      const payload = {
        setPreference: {
          notificationType: 'marketing_email',
          channel: 'email',
          enabled: false,
        },
      };
      const key = 'disable-marketing-email-twice';

      await app.inject({
        method: 'GET',
        url: `/users/${userId}/preferences`,
      });

      const first = await app.inject({
        method: 'POST',
        url: `/users/${userId}/preferences`,
        headers: { 'idempotency-key': key },
        payload,
      });
      const second = await app.inject({
        method: 'POST',
        url: `/users/${userId}/preferences`,
        headers: { 'idempotency-key': key },
        payload,
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);

      const firstMarketing = first.json().preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'marketing_email',
      );
      const secondMarketing = second.json().preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'marketing_email',
      );

      expect(firstMarketing).toEqual(secondMarketing);
      expect(secondMarketing).toMatchObject({
        enabled: false,
        source: 'user',
      });

      const prefRows = await pool.query(
        `SELECT COUNT(*)::int AS c FROM user_preferences
         WHERE user_id = $1 AND notification_type = 'marketing_email'`,
        [userId],
      );
      expect(prefRows.rows[0].c).toBe(1);

      const cmdRows = await pool.query(
        `SELECT COUNT(*)::int AS c FROM preference_commands
         WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, key],
      );
      expect(cmdRows.rows[0].c).toBe(1);

      const evaluate = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId,
          notificationType: 'marketing_email',
          channel: 'email',
          region: 'US',
          datetime: '2026-05-21T12:00:00Z',
        },
      });
      expect(evaluate.json()).toEqual({
        decision: 'deny',
        reason: 'disabled_by_user_preference',
      });
    });

    it('different idempotency keys apply the command separately', async () => {
      const userId = 'scenario5-diff-keys';

      await app.inject({
        method: 'POST',
        url: `/users/${userId}/preferences`,
        headers: { 'idempotency-key': 'key-a' },
        payload: {
          setPreference: {
            notificationType: 'marketing_email',
            channel: 'email',
            enabled: true,
          },
        },
      });

      await app.inject({
        method: 'POST',
        url: `/users/${userId}/preferences`,
        headers: { 'idempotency-key': 'key-b' },
        payload: {
          setPreference: {
            notificationType: 'marketing_email',
            channel: 'email',
            enabled: false,
          },
        },
      });

      const pool = getTestPool();
      const cmds = await pool.query(
        `SELECT COUNT(*)::int AS c FROM preference_commands WHERE user_id = $1`,
        [userId],
      );
      expect(cmds.rows[0].c).toBe(2);

      const prefs = await app.inject({
        method: 'GET',
        url: `/users/${userId}/preferences`,
      });
      const marketing = prefs.json().preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'marketing_email',
      );
      expect(marketing?.enabled).toBe(false);
    });

    it('accepts idempotencyKey in request body', async () => {
      const userId = 'scenario5-body-key';
      const payload = {
        idempotencyKey: 'body-key-1',
        setPreference: {
          notificationType: 'marketing_email',
          channel: 'email',
          enabled: false,
        },
      };

      const first = await app.inject({
        method: 'POST',
        url: `/users/${userId}/preferences`,
        payload,
      });
      const second = await app.inject({
        method: 'POST',
        url: `/users/${userId}/preferences`,
        payload,
      });

      expect(first.json().preferences).toEqual(second.json().preferences);

      const pool = getTestPool();
      const cmds = await pool.query(
        `SELECT COUNT(*)::int AS c FROM preference_commands WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, 'body-key-1'],
      );
      expect(cmds.rows[0].c).toBe(1);
    });
  });
});

async function runMigrationsSafe(pool: ReturnType<typeof getTestPool>) {
  const { runMigrations } = await import('../src/infrastructure/db/migrate.js');
  await runMigrations(pool);
}
