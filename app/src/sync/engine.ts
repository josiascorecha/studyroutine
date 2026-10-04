import type { RecordPayload, Repo, StoredRecord } from '../data/repo';
import { decryptRecord, encryptRecord, remoteRecordId, type VaultKeys } from './crypto';

export interface RemoteChange {
  id: string;
  seq: number;
  blob: string;
}

export interface SyncResponse {
  seq: number;
  more: boolean;
  changes: RemoteChange[];
}

export interface SyncTransport {
  createVault(vaultId: string, token: string): Promise<void>;
  sync(token: string, since: number, changes: { id: string; blob: string }[]): Promise<SyncResponse>;
  deleteVault(token: string): Promise<void>;
}

export type SyncErrorCode = 'OFFLINE' | 'UNAUTHENTICATED' | 'CURSOR_AHEAD' | 'QUOTA_EXCEEDED' | 'RATE_LIMITED' | 'VAULT_MISMATCH' | 'SERVER';

export class SyncError extends Error {
  constructor(
    public code: SyncErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface SyncResult {
  cursor: number;
  pushed: number;
  pulled: number;
  skipped: number;
}

const BATCH_RECORDS = 200;
const BATCH_CHARS = 1_500_000;

/**
 * Uma rodada de sincronização: envia o que mudou aqui (cifrado), recebe o que mudou
 * nos outros aparelhos desde o cursor e mescla (a versão com carimbo mais novo vence).
 */
export async function runSync(repo: Repo, keys: VaultKeys, transport: SyncTransport, cursor: number): Promise<SyncResult> {
  try {
    return await syncPass(repo, keys, transport, cursor);
  } catch (err) {
    if (err instanceof SyncError && err.code === 'CURSOR_AHEAD') {
      // O servidor voltou de um backup mais antigo: reenvia tudo e recomeça do zero.
      await repo.markAllDirty();
      return syncPass(repo, keys, transport, 0);
    }
    throw err;
  }
}

/**
 * Só recebe (não envia nada). Usado ao parear um aparelho: primeiro chegam os dados do cofre,
 * e os tipos em forceTypes (ex.: configurações) substituem os deste aparelho mesmo se forem mais antigos.
 */
export async function pullAll(repo: Repo, keys: VaultKeys, transport: SyncTransport, forceTypes: string[] = []): Promise<SyncResult> {
  let cursor = 0;
  let pulled = 0;
  let skipped = 0;
  for (let guard = 0; guard < 100_000; guard++) {
    const res = await transport.sync(keys.authToken, cursor, []);
    for (const ch of res.changes) {
      try {
        const p = await decryptRecord<RecordPayload>(keys, ch.id, ch.blob);
        if ((await remoteRecordId(keys.idKey, `${p.t}:${p.k}`)) !== ch.id) {
          skipped += 1;
          continue;
        }
        if (await repo.applyRemote(p, forceTypes.includes(p.t))) pulled += 1;
      } catch {
        skipped += 1;
      }
    }
    cursor = res.more && res.changes.length ? res.changes[res.changes.length - 1].seq : res.seq;
    if (!res.more) break;
  }
  return { cursor, pushed: 0, pulled, skipped };
}

async function syncPass(repo: Repo, keys: VaultKeys, transport: SyncTransport, startCursor: number): Promise<SyncResult> {
  let cursor = startCursor;
  let pushed = 0;
  let pulled = 0;
  let skipped = 0;

  const encrypted: { rec: StoredRecord; id: string; blob: string }[] = [];
  for (const rec of repo.dirtyRecords()) {
    const id = await remoteRecordId(keys.idKey, rec.pk);
    encrypted.push({ rec, id, blob: await encryptRecord(keys, id, repo.toPayload(rec)) });
  }
  const batches: (typeof encrypted)[] = [];
  let cur: typeof encrypted = [];
  let chars = 0;
  for (const e of encrypted) {
    if (cur.length >= BATCH_RECORDS || (cur.length && chars + e.blob.length > BATCH_CHARS)) {
      batches.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(e);
    chars += e.blob.length;
  }
  if (cur.length) batches.push(cur);

  let i = 0;
  for (let guard = 0; guard < 100_000; guard++) {
    const batch = batches[i] ?? [];
    const res = await transport.sync(
      keys.authToken,
      cursor,
      batch.map((b) => ({ id: b.id, blob: b.blob })),
    );
    for (const b of batch) await repo.markClean(b.rec.pk, b.rec.hlc);
    pushed += batch.length;
    i += 1;

    for (const ch of res.changes) {
      try {
        const p = await decryptRecord<RecordPayload>(keys, ch.id, ch.blob);
        // O id precisa bater com o conteúdo: impede que um blob seja trocado de lugar.
        if ((await remoteRecordId(keys.idKey, `${p.t}:${p.k}`)) !== ch.id) {
          skipped += 1;
          continue;
        }
        if (await repo.applyRemote(p)) pulled += 1;
      } catch {
        skipped += 1;
      }
    }
    cursor = res.more && res.changes.length ? res.changes[res.changes.length - 1].seq : res.seq;
    if (i >= batches.length && !res.more) break;
  }
  return { cursor, pushed, pulled, skipped };
}
