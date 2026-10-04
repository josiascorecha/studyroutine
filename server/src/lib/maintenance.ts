import type { Queryable } from './db.js';

/** Limpeza periódica conforme a política de retenção (docs/privacidade-e-retencao.md). */
export async function runMaintenance(db: Queryable, inactiveDays: number): Promise<{ vaultsRemoved: number }> {
  await db.query(`DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'`);
  const r = await db.query(`DELETE FROM vaults WHERE last_seen_at < now() - make_interval(days => $1)`, [inactiveDays]);
  return { vaultsRemoved: r.rowCount ?? 0 };
}
