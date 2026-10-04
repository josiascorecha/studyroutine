import { existsSync } from 'node:fs';
import path from 'node:path';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import type { Catalog } from './lib/catalog.js';
import type { Db } from './lib/db.js';
import { HttpError } from './lib/errors.js';
import { vaultRoutes } from './routes/vault.js';

export interface Deps {
  cfg: Config;
  db: Db;
  catalog: Catalog;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: Deps;
  }
}

// Campos que nunca devem aparecer em logs.
const REDACT = ['req.headers.authorization', 'req.headers.cookie'];

export async function buildApp(cfg: Config, db: Db, catalog: Catalog, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: cfg.TRUST_PROXY,
    bodyLimit: 64 * 1024,
    logger:
      opts.logger === false
        ? false
        : {
            level: cfg.LOG_LEVEL,
            redact: { paths: REDACT, censor: '[omitido]' },
            serializers: {
              // Registra só método e rota: nada de query string, IP ou corpo.
              req: (r) => ({ method: r.method, url: String(r.url).split('?')[0] }),
            },
          },
  });

  app.decorate('deps', { cfg, db, catalog });

  // A API é chamada pelo app Android (origem https://localhost do Capacitor) e pela versão web.
  // Não há cookies: a autenticação vai no cabeçalho Authorization, então não existe CSRF.
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || cfg.allowedOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
    maxAge: 600,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        // Metadados do áudio oficial (b.jw-cdn.org) e o próprio servidor.
        connectSrc: ["'self'", 'https://b.jw-cdn.org'],
        // Arquivos MP3 oficiais (cfp2.jw-cdn.org e afins).
        mediaSrc: ["'self'", 'https://*.jw-cdn.org'],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: cfg.APP_ORIGIN.startsWith('https://') ? [] : null,
      },
    },
    hsts: cfg.APP_ORIGIN.startsWith('https://') ? { maxAge: 31536000, includeSubDomains: false } : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  });

  app.addHook('onSend', async (req, reply) => {
    if (req.url.startsWith('/api/') && !reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: err.code, message: err.message });
    }
    const e = err as { statusCode?: number; code?: string; message: string };
    if (e.statusCode === 413) {
      return reply.status(413).send({ error: 'PAYLOAD_TOO_LARGE', message: 'Envio grande demais.' });
    }
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: 'BAD_REQUEST', message: 'Requisição inválida.' });
    }
    req.log.error({ err: { message: e.message, code: e.code } }, 'erro interno');
    return reply.status(500).send({ error: 'INTERNAL', message: 'Erro interno. Tente novamente.' });
  });

  app.get('/api/health', async () => {
    await db.query('SELECT 1');
    return { ok: true };
  });

  app.get('/api/v1/info', async () => ({
    service: 'studyroutine',
    privacyVersion: cfg.PRIVACY_VERSION,
    contactEmail: cfg.CONTACT_EMAIL,
    limits: { maxRecords: cfg.VAULT_MAX_RECORDS, maxBytes: cfg.VAULT_MAX_BYTES, inactiveDays: cfg.VAULT_INACTIVE_DAYS },
  }));

  // Catálogo curado: só links do jw.org, sem textos de publicações.
  app.get('/api/v1/catalogo', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=3600');
    return catalog;
  });

  await app.register(vaultRoutes, { prefix: '/api' });

  app.all('/api/*', async (_req, reply) => reply.status(404).send({ error: 'NOT_FOUND', message: 'Não encontrado.' }));

  // Versão web do app (a mesma interface empacotada no Android).
  const staticDir = cfg.STATIC_DIR ? path.resolve(cfg.STATIC_DIR) : null;
  if (staticDir && existsSync(staticDir)) {
    await app.register(fastifyStatic, {
      root: staticDir,
      wildcard: true,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.header('cache-control', 'public, max-age=31536000, immutable');
        } else {
          res.header('cache-control', 'no-cache');
        }
      },
    });
    app.setNotFoundHandler((req, reply) => {
      // Rotas da SPA (/, /privacidade, /excluir-dados…) recebem index.html; arquivos inexistentes, 404.
      const pathOnly = req.url.split('?')[0];
      if (req.method === 'GET' && !pathOnly.startsWith('/api/') && !/\.[a-z0-9]{2,5}$/i.test(pathOnly)) {
        return reply.header('cache-control', 'no-cache').sendFile('index.html');
      }
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Não encontrado.' });
    });
  }

  return app;
}
