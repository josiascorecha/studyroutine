import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { loadCatalog } from '../src/lib/catalog.js';
import { createPool } from '../src/lib/db.js';
import { migrate } from '../src/lib/migrate.js';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://studyroutine:devpass@localhost:5432/studyroutine_test';
export const CATALOG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../catalog/catalogo.json');

export function testConfig(extra: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    APP_ORIGIN: 'http://localhost:3000',
    IP_PEPPER: 'pepper-de-teste-com-mais-de-32-caracteres!!',
    LOG_LEVEL: 'silent',
    CATALOG_FILE: CATALOG,
    ...extra,
  });
}

export async function resetDb(): Promise<void> {
  const c = new pg.Client({ connectionString: TEST_DB });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await c.end();
}

export interface Ctx {
  app: FastifyInstance;
  db: pg.Pool;
  cfg: Config;
  close(): Promise<void>;
}

export async function startApp(extra: Record<string, string> = {}): Promise<Ctx> {
  await resetDb();
  const cfg = testConfig(extra);
  const db = createPool(TEST_DB);
  await migrate(db);
  const catalog = await loadCatalog(cfg.CATALOG_FILE);
  const app = await buildApp(cfg, db, catalog, { logger: false });
  await app.ready();
  return {
    app,
    db,
    cfg,
    async close() {
      await app.close();
      await db.end();
    },
  };
}

export interface Res {
  status: number;
  body: any;
  headers: Record<string, unknown>;
}

let ipSeq = 1;

/** Simula um aparelho: chave própria (token + id do cofre) e IP próprio. */
export function device(app: FastifyInstance, opts: { token?: Buffer; vaultId?: Buffer; ip?: string } = {}) {
  const token = opts.token ?? randomBytes(32);
  const vaultId = opts.vaultId ?? randomBytes(16);
  const ip = opts.ip ?? `203.0.113.${(ipSeq++ % 250) + 1}`;
  async function send(method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown, auth = true): Promise<Res> {
    const res = await app.inject({
      method,
      url,
      payload: body === undefined ? undefined : (body as any),
      remoteAddress: ip,
      headers: auth ? { authorization: `Bearer ${token.toString('base64url')}` } : {},
    });
    let parsed: any = null;
    try {
      parsed = res.json();
    } catch {
      parsed = res.body;
    }
    return { status: res.statusCode, body: parsed, headers: res.headers };
  }
  return {
    token,
    vaultId,
    ip,
    create: () => send('POST', '/api/v1/vaults', { vaultId: vaultId.toString('base64url') }),
    sync: (since: number, changes: { id: string; blob: string }[] = []) => send('POST', '/api/v1/sync', { since, changes }),
    status: () => send('GET', '/api/v1/vault'),
    remove: () => send('DELETE', '/api/v1/vault'),
    raw: send,
  };
}

export const blob = (n = 64, fill?: number) =>
  (fill === undefined ? randomBytes(n) : Buffer.alloc(n, fill)).toString('base64url');
export const uuid = () => randomUUID();
