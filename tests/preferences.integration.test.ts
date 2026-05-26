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

  describe('1. New user and defaults', () => {
    it('returns default preferences for a new user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/users/user-new/preferences',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.userId).toBe('user-new');

      const transactional = body.preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'transactional_email',
      );
      const marketing = body.preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'marketing_email',
      );

      expect(transactional?.enabled).toBe(true);
      expect(marketing?.enabled).toBe(false);
    });
  });

  describe('2. User changes preferences', () => {
    it('reflects user opt-out while keeping transactional enabled', async () => {
      await app.inject({
        method: 'POST',
        url: '/users/user-2/preferences',
        headers: { 'idempotency-key': 'enable-marketing-once' },
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
        url: '/users/user-2/preferences',
        headers: { 'idempotency-key': 'disable-marketing' },
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
        url: '/users/user-2/preferences',
      });
      const data = prefs.json();
      const marketing = data.preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'marketing_email',
      );
      const transactional = data.preferences.find(
        (p: { notificationType: string }) =>
          p.notificationType === 'transactional_email',
      );

      expect(marketing?.enabled).toBe(false);
      expect(transactional?.enabled).toBe(true);

      const allowTransactional = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId: 'user-2',
          notificationType: 'transactional_email',
          channel: 'email',
          region: 'US',
          datetime: '2026-05-21T12:00:00Z',
        },
      });
      expect(allowTransactional.json().decision).toBe('allow');

      const denyMarketing = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId: 'user-2',
          notificationType: 'marketing_email',
          channel: 'email',
          region: 'US',
          datetime: '2026-05-21T12:00:00Z',
        },
      });
      expect(denyMarketing.json().decision).toBe('deny');
      expect(denyMarketing.json().reason).toBe('disabled_by_user_preference');
    });
  });

  describe('3. Quiet hours', () => {
    it('blocks marketing push during quiet hours but allows transactional', async () => {
      await app.inject({
        method: 'POST',
        url: '/users/user-qh/preferences',
        headers: { 'idempotency-key': 'qh-setup' },
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

      // 23:30 Moscow = 20:30 UTC in winter; use summer: MSK UTC+3
      // 2026-05-21T20:30:00Z = 23:30 in Moscow (May is DST off, MSK = UTC+3)
      const duringQuiet = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId: 'user-qh',
          notificationType: 'marketing_push',
          channel: 'push',
          region: 'RU',
          datetime: '2026-05-21T20:30:00Z',
        },
      });
      expect(duringQuiet.json().decision).toBe('deny');
      expect(duringQuiet.json().reason).toBe('blocked_by_quiet_hours');

      const transactionalDuringQuiet = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId: 'user-qh',
          notificationType: 'transactional_push',
          channel: 'push',
          region: 'RU',
          datetime: '2026-05-21T20:30:00Z',
        },
      });
      expect(transactionalDuringQuiet.json().decision).toBe('allow');

      const outsideQuiet = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId: 'user-qh',
          notificationType: 'marketing_push',
          channel: 'push',
          region: 'RU',
          datetime: '2026-05-21T10:00:00Z',
        },
      });
      expect(outsideQuiet.json().decision).toBe('allow');
    });
  });

  describe('4. Global policies', () => {
    it('denies marketing_sms in EU per global policy', async () => {
      await app.inject({
        method: 'GET',
        url: '/users/user-eu/preferences',
      });

      await app.inject({
        method: 'POST',
        url: '/users/user-eu/preferences',
        headers: { 'idempotency-key': 'enable-sms' },
        payload: {
          setPreference: {
            notificationType: 'marketing_sms',
            channel: 'sms',
            enabled: true,
          },
        },
      });

      const res = await app.inject({
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

      expect(res.json().decision).toBe('deny');
      expect(res.json().reason).toBe('blocked_by_global_policy');

      const us = await app.inject({
        method: 'POST',
        url: '/evaluate',
        payload: {
          userId: 'user-eu',
          notificationType: 'marketing_sms',
          channel: 'sms',
          region: 'US',
          datetime: '2026-05-21T21:30:00Z',
        },
      });
      expect(us.json().decision).toBe('allow');
    });
  });

  describe('5. Idempotency', () => {
    it('applying the same disable command twice leaves stable state', async () => {
      const payload = {
        setPreference: {
          notificationType: 'marketing_email',
          channel: 'email',
          enabled: false,
        },
      };
      const key = 'disable-marketing-email-twice';

      const first = await app.inject({
        method: 'POST',
        url: '/users/user-idem/preferences',
        headers: { 'idempotency-key': key },
        payload,
      });
      const second = await app.inject({
        method: 'POST',
        url: '/users/user-idem/preferences',
        headers: { 'idempotency-key': key },
        payload,
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);

      const prefs = second.json().preferences.filter(
        (p: { notificationType: string }) =>
          p.notificationType === 'marketing_email',
      );
      expect(prefs).toHaveLength(1);
      expect(prefs[0].enabled).toBe(false);

      const pool = getTestPool();
      const cmds = await pool.query(
        `SELECT COUNT(*)::int AS c FROM preference_commands WHERE user_id = $1 AND idempotency_key = $2`,
        ['user-idem', key],
      );
      expect(cmds.rows[0].c).toBe(1);
    });
  });
});

async function runMigrationsSafe(pool: ReturnType<typeof getTestPool>) {
  const { runMigrations } = await import('../src/infrastructure/db/migrate.js');
  await runMigrations(pool);
}
