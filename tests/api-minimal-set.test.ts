import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import { closeTestPool, getTestPool, resetDatabase } from './setup.js';

/**
 * Minimal API set from assignment (REST):
 * GET  /users/:id/preferences
 * POST /users/:id/preferences
 * POST /evaluate
 */
describe('API minimal set (assignment)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const pool = getTestPool();
    const { runMigrations } = await import('../src/infrastructure/db/migrate.js');
    await runMigrations(pool);
    app = await buildServer(pool);
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    if (app) await app.close();
    await closeTestPool();
  });

  it('GET /users/:id/preferences', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users/user-1/preferences',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    const body = res.json();
    expect(body.userId).toBe('user-1');
    expect(Array.isArray(body.preferences)).toBe(true);
    expect(body).toHaveProperty('quietHours');
  });

  it('POST /users/:id/preferences — setPreference and quietHours in one body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users/user-1/preferences',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'api-minimal-1',
      },
      payload: {
        setPreference: {
          notificationType: 'marketing_email',
          channel: 'email',
          enabled: false,
        },
        quietHours: {
          timezone: 'Europe/Moscow',
          start: '22:00',
          end: '08:00',
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.userId).toBe('user-1');
    expect(body.quietHours).toEqual({
      timezone: 'Europe/Moscow',
      start: '22:00',
      end: '08:00',
    });
    const email = body.preferences.find(
      (p: { notificationType: string }) =>
        p.notificationType === 'marketing_email',
    );
    expect(email?.enabled).toBe(false);
  });

  it('POST /evaluate — request/response format from assignment', async () => {
    await app.inject({
      method: 'GET',
      url: '/users/user-1/preferences',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/evaluate',
      headers: { 'content-type': 'application/json' },
      payload: {
        userId: 'user-1',
        notificationType: 'marketing_sms',
        channel: 'sms',
        region: 'EU',
        datetime: '2026-05-21T21:30:00Z',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      decision: 'deny',
      reason: 'blocked_by_global_policy',
    });
  });

  it('POST /evaluate — allow response has only decision', async () => {
    await app.inject({
      method: 'GET',
      url: '/users/user-allow/preferences',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/evaluate',
      payload: {
        userId: 'user-allow',
        notificationType: 'transactional_email',
        channel: 'email',
        region: 'EU',
        datetime: '2026-05-21T21:30:00Z',
      },
    });

    expect(res.json()).toEqual({ decision: 'allow' });
  });
});
