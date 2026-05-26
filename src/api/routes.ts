import type { FastifyInstance } from 'fastify';
import { PreferencesService } from '../application/preferences-service.js';
import { ValidationError, validateUpdateCommand } from '../domain/validation.js';
import {
  assertChannel,
  assertNotificationType,
  assertRegion,
} from '../domain/validation.js';
import type { EvaluateRequest } from '../domain/types.js';
import { randomUUID } from 'node:crypto';

export function registerRoutes(
  app: FastifyInstance,
  service: PreferencesService,
): void {
  app.get<{ Params: { id: string } }>(
    '/users/:id/preferences',
    async (request, reply) => {
      const snapshot = await service.getUserPreferences(request.params.id);
      return reply.send({
        userId: snapshot.userId,
        preferences: snapshot.preferences,
        quietHours: snapshot.quietHours,
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/users/:id/preferences',
    async (request, reply) => {
      try {
        const command = validateUpdateCommand(request.body);
        const idempotencyKey =
          (request.headers['idempotency-key'] as string | undefined) ??
          (typeof request.body === 'object' &&
          request.body !== null &&
          'idempotencyKey' in request.body
            ? String((request.body as { idempotencyKey?: string }).idempotencyKey)
            : undefined) ??
          randomUUID();

        const snapshot = await service.updateUserPreferences(
          request.params.id,
          command,
          idempotencyKey,
        );

        return reply.send({
          userId: snapshot.userId,
          preferences: snapshot.preferences,
          quietHours: snapshot.quietHours,
        });
      } catch (err) {
        if (err instanceof ValidationError) {
          return reply.status(400).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  app.post('/evaluate', async (request, reply) => {
    try {
      const body = request.body as Record<string, unknown>;
      const evaluateRequest: EvaluateRequest = {
        userId: String(body.userId ?? ''),
        notificationType: assertNotificationType(
          String(body.notificationType ?? ''),
        ),
        channel: assertChannel(String(body.channel ?? '')),
        region: assertRegion(String(body.region ?? '')),
        datetime: String(body.datetime ?? ''),
      };

      if (!evaluateRequest.userId) {
        return reply.status(400).send({ error: 'userId is required' });
      }
      if (Number.isNaN(Date.parse(evaluateRequest.datetime))) {
        return reply.status(400).send({ error: 'datetime must be valid ISO-8601' });
      }

      const result = await service.evaluate(evaluateRequest);
      return reply.send(result);
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.status(400).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok' });
  });
}
