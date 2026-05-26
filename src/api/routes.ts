import type { FastifyInstance } from 'fastify';
import { PreferencesService } from '../application/preferences-service.js';
import {
  ValidationError,
  validateEvaluateRequest,
  validateUpdateCommand,
} from '../domain/validation.js';
import { randomUUID } from 'node:crypto';

/** Assignment minimal REST API */
export const API_ROUTES = {
  getUserPreferences: 'GET /users/:id/preferences',
  updateUserPreferences: 'POST /users/:id/preferences',
  evaluate: 'POST /evaluate',
} as const;

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
      const evaluateRequest = validateEvaluateRequest(request.body);
      const result = await service.evaluate(evaluateRequest);
      return reply.send(result);
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.status(400).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get('/defaults', async (_request, reply) => {
    const preferences = await service.getDefaultPreferences();
    return reply.send({ preferences });
  });

  app.get('/policies', async (_request, reply) => {
    const policies = await service.getGlobalPolicies();
    return reply.send({ policies });
  });

  app.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok' });
  });
}
