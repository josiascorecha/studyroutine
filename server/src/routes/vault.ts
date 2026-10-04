import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withTx } from '../lib/db.js';
import { badRequest, conflict, quota, unauthorized } from '../lib/errors.js';
import { hit, isBlocked } from '../lib/rateLimit.js';
import { bearerToken, decodeB64url, ipBucket, sha256 } from '../lib/security.js';

interface VaultRow {
  id: Buffer;
  seq: number;
  records: number;
  bytes: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const createBody = z.object({ vaultId: z.string().length(22) });

function syncBody(maxBatch: number, maxRecordBytes: number) {
  // base64url de N bytes ocupa ceil(N*4/3) caracteres.
  const maxChars = Math.ceil((maxRecordBytes * 4) / 3);
  return z.object({
    since: z.number().int().min(0),
    changes: z
      .array(
        z.object({
          id: z.string().regex(UUID),
          blob: z.string().min(16).max(maxChars).regex(/^[A-Za-z0-9_-]+$/),
        }),
      )
      .max(maxBatch)
      .default([]),
  });
}

export async function vaultRoutes(app: FastifyInstance) {
  const { cfg, db } = app.deps;
  const SyncBody = syncBody(cfg.SYNC_BATCH_MAX, cfg.RECORD_MAX_BYTES);

  /** Identifica o cofre pelo token. Falhas contam no limite por IP, para dificultar adivinhação. */
  async function authVault(req: FastifyRequest): Promise<VaultRow> {
    const ipKey = `auth-fail:${ipBucket(cfg.IP_PEPPER, req.ip)}`;
    if (await isBlocked(db, ipKey, cfg.AUTH_FAILURES_PER_IP, 900)) throw unauthorized('Muitas tentativas. Aguarde alguns minutos.');
    const token = bearerToken(req.headers.authorization);
    if (token) {
      const { rows } = await db.query<VaultRow>(
        'SELECT id, seq, records, bytes FROM vaults WHERE auth_hash = $1',
        [sha256(token)],
      );
      if (rows[0]) return rows[0];
    }
    await hit(db, ipKey, cfg.AUTH_FAILURES_PER_IP + 1, 900).catch(() => {});
    throw unauthorized();
  }

  // Cria o cofre (idempotente: o segundo aparelho com a mesma chave recebe 200).
  app.post('/v1/vaults', async (req, reply) => {
    const token = bearerToken(req.headers.authorization);
    if (!token) throw unauthorized();
    const parsed = createBody.safeParse(req.body);
    const vaultId = parsed.success ? decodeB64url(parsed.data.vaultId, 16) : null;
    if (!vaultId) throw badRequest('Identificador do cofre inválido.');
    const authHash = sha256(token);

    const existing = await db.query<{ id: Buffer; auth_hash: Buffer }>(
      'SELECT id, auth_hash FROM vaults WHERE id = $1 OR auth_hash = $2',
      [vaultId, authHash],
    );
    if (existing.rows.length) {
      const same = existing.rows.length === 1 && existing.rows[0].id.equals(vaultId) && existing.rows[0].auth_hash.equals(authHash);
      if (!same) throw conflict('Este cofre já existe com outra chave.', 'VAULT_MISMATCH');
      await db.query(`UPDATE vaults SET last_seen_at = date_trunc('day', now()) WHERE id = $1`, [vaultId]);
      return reply.status(200).send({ created: false });
    }

    await hit(db, `vault-create:${ipBucket(cfg.IP_PEPPER, req.ip)}`, cfg.VAULTS_PER_IP_PER_DAY, 86_400);
    try {
      await db.query('INSERT INTO vaults (id, auth_hash) VALUES ($1, $2)', [vaultId, authHash]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw conflict('Este cofre já existe com outra chave.', 'VAULT_MISMATCH');
      throw err;
    }
    return reply.status(201).send({ created: true });
  });

  // Situação do cofre (quanto está ocupado). Não revela conteúdo, que o servidor nem consegue ler.
  app.get('/v1/vault', async (req) => {
    const v = await authVault(req);
    return {
      seq: v.seq,
      records: v.records,
      bytes: v.bytes,
      maxRecords: cfg.VAULT_MAX_RECORDS,
      maxBytes: cfg.VAULT_MAX_BYTES,
    };
  });

  // Envia alterações e recebe o que mudou desde o cursor "since", numa só ida e volta.
  app.post('/v1/sync', { bodyLimit: 8 * 1024 * 1024 }, async (req) => {
    const v = await authVault(req);
    const parsed = SyncBody.safeParse(req.body);
    if (!parsed.success) throw badRequest('Dados de sincronização inválidos.');
    const vaultKey = v.id.toString('base64url');
    await hit(db, `sync:${vaultKey}`, cfg.SYNCS_PER_VAULT_PER_HOUR, 3600);

    // Se o mesmo registro vier duas vezes no lote, vale a última versão.
    const byId = new Map<string, Buffer>();
    for (const ch of parsed.data.changes) {
      const buf = Buffer.from(ch.blob, 'base64url');
      if (buf.length > cfg.RECORD_MAX_BYTES) throw badRequest('Registro grande demais.');
      byId.delete(ch.id);
      byId.set(ch.id, buf);
    }
    const since = parsed.data.since;

    return withTx(db, async (tx) => {
      // Trava o cofre: escritas do mesmo cofre ficam em fila, então a ordem do
      // "seq" é a ordem de gravação e quem lê pelo cursor nunca pula registros.
      const locked = await tx.query<VaultRow>('SELECT id, seq, records, bytes FROM vaults WHERE id = $1 FOR UPDATE', [v.id]);
      let { seq, records, bytes } = locked.rows[0];
      if (since > seq) throw conflict('O cursor do aparelho está à frente do servidor.', 'CURSOR_AHEAD');

      if (byId.size) {
        const ids = [...byId.keys()];
        const old = await tx.query<{ record_id: string; size: number }>(
          'SELECT record_id::text, octet_length(blob) AS size FROM records WHERE vault_id = $1 AND record_id = ANY($2::uuid[])',
          [v.id, ids],
        );
        const oldSize = new Map(old.rows.map((r) => [r.record_id, Number(r.size)]));
        const seqs: number[] = [];
        const blobs: Buffer[] = [];
        for (const id of ids) {
          const buf = byId.get(id)!;
          seq += 1;
          seqs.push(seq);
          blobs.push(buf);
          const prev = oldSize.get(id);
          if (prev === undefined) {
            records += 1;
            bytes += buf.length;
          } else {
            bytes += buf.length - prev;
          }
        }
        if (records > cfg.VAULT_MAX_RECORDS || bytes > cfg.VAULT_MAX_BYTES) throw quota();
        await tx.query(
          `INSERT INTO records (vault_id, record_id, seq, blob)
           SELECT $1, u.id, u.seq, u.blob FROM unnest($2::uuid[], $3::bigint[], $4::bytea[]) AS u(id, seq, blob)
           ON CONFLICT (vault_id, record_id) DO UPDATE SET seq = EXCLUDED.seq, blob = EXCLUDED.blob`,
          [v.id, ids, seqs, blobs],
        );
      }

      await tx.query(
        `UPDATE vaults SET seq = $2, records = $3, bytes = $4, last_seen_at = date_trunc('day', now()) WHERE id = $1`,
        [v.id, seq, records, bytes],
      );

      const page = cfg.PULL_PAGE_SIZE;
      const pulled = await tx.query<{ record_id: string; seq: number; blob: Buffer }>(
        'SELECT record_id::text, seq, blob FROM records WHERE vault_id = $1 AND seq > $2 ORDER BY seq LIMIT $3',
        [v.id, since, page + 1],
      );
      const more = pulled.rows.length > page;
      const rows = more ? pulled.rows.slice(0, page) : pulled.rows;
      return {
        seq,
        more,
        changes: rows.map((r) => ({ id: r.record_id, seq: Number(r.seq), blob: r.blob.toString('base64url') })),
      };
    });
  });

  // Apaga o cofre e tudo o que há nele, na hora.
  app.delete('/v1/vault', async (req, reply) => {
    const v = await authVault(req);
    await db.query('DELETE FROM vaults WHERE id = $1', [v.id]);
    return reply.status(204).send();
  });
}
