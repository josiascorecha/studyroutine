import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const here = path.dirname(fileURLToPath(import.meta.url));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  // Endereço público do serviço (ex.: https://studyroutine.j2bot.com.br).
  APP_ORIGIN: z.string().url().default('http://localhost:3000'),
  // Origens extras que podem chamar a API (o app Android do Capacitor usa https://localhost).
  EXTRA_ORIGINS: z.string().default('https://localhost,capacitor://localhost,http://localhost,http://localhost:5173'),
  TRUST_PROXY: bool.default(false),
  // Segredo para gerar o hash do IP nos limites de tentativa (o IP nunca é gravado em claro).
  IP_PEPPER: z.string().min(32, 'IP_PEPPER deve ter ao menos 32 caracteres'),
  VAULT_MAX_BYTES: z.coerce.number().int().min(1024).default(20 * 1024 * 1024),
  VAULT_MAX_RECORDS: z.coerce.number().int().min(10).default(50_000),
  RECORD_MAX_BYTES: z.coerce.number().int().min(512).default(64 * 1024),
  SYNC_BATCH_MAX: z.coerce.number().int().min(1).max(1000).default(500),
  PULL_PAGE_SIZE: z.coerce.number().int().min(10).max(5000).default(1000),
  // Cofres sem nenhuma sincronização por este prazo são apagados (informar na política de privacidade).
  VAULT_INACTIVE_DAYS: z.coerce.number().int().min(30).default(548),
  VAULTS_PER_IP_PER_DAY: z.coerce.number().int().min(1).default(10),
  SYNCS_PER_VAULT_PER_HOUR: z.coerce.number().int().min(10).default(720),
  AUTH_FAILURES_PER_IP: z.coerce.number().int().min(5).default(60),
  CATALOG_FILE: z.string().default(path.resolve(here, '../catalog/catalogo.json')),
  STATIC_DIR: z.string().optional(),
  PRIVACY_VERSION: z.string().default('2026-10-04'),
  CONTACT_EMAIL: z.string().default('contato@example.com'),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = z.infer<typeof schema> & { allowedOrigins: string[] };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${msg}`);
  }
  const c = parsed.data;
  const appOrigin = c.APP_ORIGIN.replace(/\/$/, '');
  if (c.NODE_ENV === 'production' && !appOrigin.startsWith('https://')) {
    throw new Error('Em produção APP_ORIGIN deve usar https');
  }
  const extra = c.EXTRA_ORIGINS.split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean)
    // Em produção, origens http:// (de desenvolvimento) ficam de fora.
    .filter((o) => c.NODE_ENV !== 'production' || !o.startsWith('http://'));
  return { ...c, APP_ORIGIN: appOrigin, allowedOrigins: Array.from(new Set([appOrigin, ...extra])) };
}
