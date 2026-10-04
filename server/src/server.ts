import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { loadCatalog } from './lib/catalog.js';
import { createPool } from './lib/db.js';
import { runMaintenance } from './lib/maintenance.js';
import { migrate } from './lib/migrate.js';

const cfg = loadConfig();
const db = createPool(cfg.DATABASE_URL);
const catalog = await loadCatalog(cfg.CATALOG_FILE);

await migrate(db, (m) => console.log(m));
const app = await buildApp(cfg, db, catalog);

const maintenance = async () => {
  try {
    const r = await runMaintenance(db, cfg.VAULT_INACTIVE_DAYS);
    if (r.vaultsRemoved) app.log.info({ removidos: r.vaultsRemoved }, 'cofres inativos removidos');
  } catch (err) {
    app.log.error({ err: (err as Error).message }, 'falha na manutenção');
  }
};
await maintenance();
const timer = setInterval(maintenance, 3600_000);

const shutdown = async (signal: string) => {
  app.log.info(`recebido ${signal}, encerrando`);
  clearInterval(timer);
  await app.close();
  await db.end();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: cfg.HOST, port: cfg.PORT });
