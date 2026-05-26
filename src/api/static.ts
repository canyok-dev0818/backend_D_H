import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolvePublicDir(): string {
  const candidates = [
    join(process.cwd(), 'public'),
    join(__dirname, '..', 'public'),
    join(process.cwd(), 'dist', 'public'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) {
      return dir;
    }
  }
  throw new Error('public/ directory with index.html not found');
}

export async function registerStaticUi(app: FastifyInstance): Promise<void> {
  const root = resolvePublicDir();

  await app.register(fastifyStatic, {
    root,
    prefix: '/',
    decorateReply: false,
  });

  app.get('/ui', async (_request, reply) => {
    return reply.redirect('/');
  });
}
