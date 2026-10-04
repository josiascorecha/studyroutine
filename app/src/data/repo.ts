import { compareHlc, Hlc } from '../sync/hlc';
import { clearStore, getAll, getOne, openDb, putMany, putOne, STORES } from './idb';

/**
 * Tudo o que a pessoa registra vira um registro {tipo, chave, dados} com carimbo de tempo (HLC).
 * Apagar não remove: marca como apagado (tombstone), para que a exclusão também sincronize.
 */
export interface StoredRecord<T = unknown> {
  pk: string;
  type: string;
  key: string;
  data: T | null;
  hlc: string;
  deleted: 0 | 1;
  dirty: 0 | 1;
}

/** Forma que viaja cifrada entre aparelhos. */
export interface RecordPayload {
  t: string;
  k: string;
  d: unknown;
  h: string;
  x: 0 | 1;
}

export const pkOf = (type: string, key: string) => `${type}:${key}`;

function randomNode(): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 10);
}

export class Repo {
  private mem = new Map<string, StoredRecord>();
  private listeners = new Set<() => void>();
  private hlc!: Hlc;
  /** Muda a cada alteração: útil para o React saber quando redesenhar. */
  version = 0;

  private constructor(private db: IDBDatabase) {}

  static async open(name?: string, now: () => number = Date.now): Promise<Repo> {
    const db = await openDb(name);
    const repo = new Repo(db);
    let node = await getOne<string>(db, STORES.meta, 'node');
    if (!node) {
      node = randomNode();
      await putOne(db, STORES.meta, node, 'node');
    }
    repo.hlc = new Hlc(node, now);
    for (const r of await getAll<StoredRecord>(db, STORES.records)) {
      repo.mem.set(r.pk, r);
      repo.hlc.receive(r.hlc);
    }
    return repo;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.version += 1;
    for (const fn of this.listeners) fn();
  }

  get<T>(type: string, key: string): T | undefined {
    const r = this.mem.get(pkOf(type, key));
    return r && !r.deleted ? (r.data as T) : undefined;
  }

  list<T>(type: string): { key: string; data: T }[] {
    const out: { key: string; data: T }[] = [];
    for (const r of this.mem.values()) if (r.type === type && !r.deleted) out.push({ key: r.key, data: r.data as T });
    return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  async put<T>(type: string, key: string, data: T): Promise<void> {
    const rec: StoredRecord<T> = { pk: pkOf(type, key), type, key, data, hlc: this.hlc.tick(), deleted: 0, dirty: 1 };
    this.mem.set(rec.pk, rec);
    this.notify();
    await putOne(this.db, STORES.records, rec);
  }

  async remove(type: string, key: string): Promise<void> {
    const pk = pkOf(type, key);
    if (!this.mem.has(pk)) return;
    const rec: StoredRecord = { pk, type, key, data: null, hlc: this.hlc.tick(), deleted: 1, dirty: 1 };
    this.mem.set(pk, rec);
    this.notify();
    await putOne(this.db, STORES.records, rec);
  }

  all(): StoredRecord[] {
    return [...this.mem.values()];
  }

  dirtyRecords(): StoredRecord[] {
    return this.all().filter((r) => r.dirty);
  }

  toPayload(r: StoredRecord): RecordPayload {
    return { t: r.type, k: r.key, d: r.data, h: r.hlc, x: r.deleted };
  }

  /**
   * Aplica uma versão vinda de outro aparelho se ela for mais nova. Devolve true se mudou algo.
   * force: usado ao parear um aparelho novo, para que as configurações do cofre prevaleçam.
   */
  async applyRemote(p: RecordPayload, force = false): Promise<boolean> {
    const pk = pkOf(p.t, p.k);
    const local = this.mem.get(pk);
    this.hlc.receive(p.h);
    if (local && !force && compareHlc(p.h, local.hlc) <= 0) return false;
    if (local && force && local.hlc === p.h) return false;
    const rec: StoredRecord = { pk, type: p.t, key: p.k, data: p.x ? null : p.d, hlc: p.h, deleted: p.x ? 1 : 0, dirty: 0 };
    this.mem.set(pk, rec);
    this.notify();
    await putOne(this.db, STORES.records, rec);
    return true;
  }

  /** Marca como enviado, desde que não tenha mudado de novo enquanto sincronizava. */
  async markClean(pk: string, hlc: string): Promise<void> {
    const r = this.mem.get(pk);
    if (!r || r.hlc !== hlc || !r.dirty) return;
    const rec = { ...r, dirty: 0 as const };
    this.mem.set(pk, rec);
    await putOne(this.db, STORES.records, rec);
  }

  async markAllDirty(): Promise<void> {
    const recs = this.all().map((r) => ({ ...r, dirty: 1 as const }));
    for (const r of recs) this.mem.set(r.pk, r);
    await putMany(this.db, STORES.records, recs);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return getOne<T>(this.db, STORES.meta, key);
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await putOne(this.db, STORES.meta, value, key);
    this.notify();
  }

  async getCache<T>(key: string): Promise<T | undefined> {
    return getOne<T>(this.db, STORES.cache, key);
  }

  async setCache(key: string, value: unknown): Promise<void> {
    await putOne(this.db, STORES.cache, value, key);
  }

  /** Apaga tudo deste aparelho (usado em "Apagar dados deste aparelho"). */
  async wipe(): Promise<void> {
    await clearStore(this.db, STORES.records);
    await clearStore(this.db, STORES.cache);
    this.mem.clear();
    this.notify();
  }

  close(): void {
    this.db.close();
  }
}
