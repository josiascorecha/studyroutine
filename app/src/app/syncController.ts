import type { Repo } from '../data/repo';
import { deriveKeys, normalizeKey, type VaultKeys } from '../sync/crypto';
import { pullAll, runSync, SyncError, type SyncTransport } from '../sync/engine';
import { httpTransport, syncMessage } from '../sync/http';

/** Estado da sincronização guardado só neste aparelho (a chave nunca vai para o servidor). */
export interface SyncMeta {
  key: string;
  server: string;
  cursor: number;
  lastSyncAt: number | null;
  lastError: string | null;
}

export class SyncController {
  meta: SyncMeta | null = null;
  running = false;
  private keys: VaultKeys | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  version = 0;

  constructor(
    private repo: Repo,
    private makeTransport: (server: string) => SyncTransport = (s) => httpTransport(s),
  ) {}

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.version += 1;
    for (const fn of this.listeners) fn();
  }

  get enabled(): boolean {
    return !!this.meta;
  }

  async load(): Promise<void> {
    this.meta = (await this.repo.getMeta<SyncMeta>('sync')) ?? null;
    this.keys = this.meta ? await deriveKeys(this.meta.key) : null;
    this.notify();
  }

  private async saveMeta(patch: Partial<SyncMeta> | null) {
    this.meta = patch === null ? null : ({ ...(this.meta as SyncMeta), ...patch } as SyncMeta);
    await this.repo.setMeta('sync', this.meta);
    this.notify();
  }

  /**
   * Liga a sincronização. "new": chave recém-criada neste aparelho. "pair": chave de outro aparelho;
   * primeiro recebe o que há no cofre (as configurações de lá prevalecem) e depois envia o que existe aqui.
   */
  async activate(rawKey: string, server: string, mode: 'new' | 'pair' = 'new'): Promise<void> {
    const key = normalizeKey(rawKey);
    if (!key) throw new SyncError('SERVER', 'Chave inválida.');
    if (!server) throw new SyncError('SERVER', 'Informe o endereço do servidor de sincronização.');
    const keys = await deriveKeys(key);
    const transport = this.makeTransport(server);
    await transport.createVault(keys.vaultId, keys.authToken);
    let cursor = 0;
    if (mode === 'pair') cursor = (await pullAll(this.repo, keys, transport, ['config'])).cursor;
    this.keys = keys;
    await this.saveMeta({ key, server, cursor, lastSyncAt: null, lastError: null });
    // Tudo o que já existe neste aparelho entra no cofre.
    await this.repo.markAllDirty();
    await this.syncNow();
  }

  async syncNow(): Promise<void> {
    if (!this.meta || !this.keys || this.running) return;
    this.running = true;
    this.notify();
    try {
      const r = await runSync(this.repo, this.keys, this.makeTransport(this.meta.server), this.meta.cursor);
      await this.saveMeta({ cursor: r.cursor, lastSyncAt: Date.now(), lastError: null });
    } catch (err) {
      const msg = err instanceof SyncError ? err.message : syncMessage('SERVER');
      if (this.meta) await this.saveMeta({ lastError: msg });
    } finally {
      this.running = false;
      this.notify();
    }
  }

  /** Desliga neste aparelho. Os dados continuam aqui e no servidor. */
  async disable(): Promise<void> {
    this.keys = null;
    await this.saveMeta(null);
  }

  /** Apaga o cofre no servidor (para todos os aparelhos) e desliga aqui. */
  async deleteServerData(): Promise<void> {
    if (!this.meta || !this.keys) return;
    await this.makeTransport(this.meta.server).deleteVault(this.keys.authToken);
    await this.disable();
  }

  /** Sincroniza alguns segundos depois de cada alteração, quando a rede volta e de tempos em tempos. */
  startAuto(): () => void {
    const unsub = this.repo.subscribe(() => {
      if (this.enabled && !this.running && this.repo.dirtyRecords().length) this.schedule(4000);
    });
    const online = () => this.schedule(500);
    const visible = () => {
      if (document.visibilityState === 'visible') this.schedule(500);
    };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    const every = setInterval(() => this.schedule(0), 15 * 60_000);
    this.schedule(1000);
    return () => {
      unsub();
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
      clearInterval(every);
      if (this.timer) clearTimeout(this.timer);
    };
  }

  private schedule(ms: number) {
    if (!this.enabled) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.syncNow(), ms);
  }
}
