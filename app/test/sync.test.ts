import { describe, expect, it } from 'vitest';
import { parseChapterAudio, parseStudyIssue, parseTime } from '../src/audio/official';
import { Repo } from '../src/data/repo';
import {
  decryptRecord,
  deriveKeys,
  encryptRecord,
  fromB64url,
  generateRecoveryKey,
  KEY_ALPHABET,
  normalizeKey,
  remoteRecordId,
  toB64url,
} from '../src/sync/crypto';
import { pullAll, runSync, SyncError, type SyncResponse, type SyncTransport } from '../src/sync/engine';
import { compareHlc, Hlc } from '../src/sync/hlc';
import { chapterApiResponse, issueApiResponse } from './fixtures';

const KEY = 'K7QM-ZP3D-9XTA-ABCD-EFGH-JKMN-PQRS';

describe('chave de recuperação', () => {
  it('tem 28 caracteres do alfabeto sem ambiguidade, em grupos de 4', () => {
    for (let i = 0; i < 50; i++) {
      const k = generateRecoveryKey();
      expect(k).toMatch(/^([A-Z2-9]{4}-){6}[A-Z2-9]{4}$/);
      for (const ch of k.replace(/-/g, '')) expect(KEY_ALPHABET).toContain(ch);
    }
  });

  it('não tem viés: bytes acima de 239 são descartados', () => {
    const seq = [255, 250, 240, 0, 1, 29, 30, 239];
    let i = 0;
    const k = generateRecoveryKey((n) => new Uint8Array(Array.from({ length: n }, () => seq[i++ % seq.length])));
    // 255, 250 e 240 são descartados; 0→A, 1→B, 29→9, 30→A, 239→9.
    expect(k.startsWith('AB9A-9AB9')).toBe(true);
  });

  it('normaliza o que a pessoa digita', () => {
    expect(normalizeKey(KEY.toLowerCase().replace(/-/g, ' '))).toBe(KEY);
    expect(normalizeKey('curta')).toBeNull();
    expect(normalizeKey(KEY.replace('K', '0'))).toBeNull();
  });
});

describe('cifra de ponta a ponta', () => {
  it('a mesma chave gera o mesmo cofre em qualquer aparelho; chaves diferentes, cofres diferentes', async () => {
    const a = await deriveKeys(KEY);
    const b = await deriveKeys(KEY.toLowerCase());
    const c = await deriveKeys(generateRecoveryKey());
    expect(a.vaultId).toBe(b.vaultId);
    expect(a.authToken).toBe(b.authToken);
    expect(fromB64url(a.vaultId)).toHaveLength(16);
    expect(fromB64url(a.authToken)).toHaveLength(32);
    expect(c.vaultId).not.toBe(a.vaultId);
    expect(await remoteRecordId(a.idKey, 'leitura:2026-10-05:2026-10-02')).toBe(await remoteRecordId(b.idKey, 'leitura:2026-10-05:2026-10-02'));
    expect(await remoteRecordId(a.idKey, 'x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('cifra, decifra, esconde o conteúdo e o tamanho, e recusa adulteração', async () => {
    const k = await deriveKeys(KEY);
    const id = await remoteRecordId(k.idKey, 'texto:2026-10-02');
    const value = { t: 'texto', k: '2026-10-02', d: { done: true, note: 'Jeová revela segredos' } };
    const blob = await encryptRecord(k, id, value);
    expect(blob).not.toContain('texto');
    expect(fromB64url(blob).length).toBe(1 + 12 + 256 + 16);
    expect(await decryptRecord(k, id, blob)).toEqual(value);

    const outroId = await remoteRecordId(k.idKey, 'texto:2026-10-03');
    await expect(decryptRecord(k, outroId, blob)).rejects.toThrow();
    const bytes = fromB64url(blob);
    bytes[20] ^= 1;
    await expect(decryptRecord(k, id, toB64url(bytes))).rejects.toThrow();
    const outra = await deriveKeys(generateRecoveryKey());
    await expect(decryptRecord(outra, id, blob)).rejects.toThrow();
  });
});

describe('relógio lógico híbrido', () => {
  it('cresce sempre, mesmo com o relógio parado ou atrasado', () => {
    let t = 1000;
    const h = new Hlc('a', () => t);
    const s1 = h.tick();
    const s2 = h.tick();
    t = 500;
    const s3 = h.tick();
    expect(compareHlc(s1, s2)).toBe(-1);
    expect(compareHlc(s2, s3)).toBe(-1);
    h.receive('9999999999999-0000-b');
    expect(compareHlc(h.tick(), '9999999999999-0000-b')).toBe(1);
  });
});

/** Servidor em memória com as mesmas regras do server/ (seq por cofre, cursor, CURSOR_AHEAD). */
function memoryServer() {
  const vaults = new Map<string, { vaultId: string; seq: number; records: Map<string, { seq: number; blob: string }> }>();
  const calls = { sync: 0 };
  const transport: SyncTransport = {
    async createVault(vaultId, token) {
      if (!vaults.has(token)) vaults.set(token, { vaultId, seq: 0, records: new Map() });
    },
    async sync(token, since, changes): Promise<SyncResponse> {
      calls.sync++;
      const v = vaults.get(token);
      if (!v) throw new SyncError('UNAUTHENTICATED', 'x');
      if (since > v.seq) throw new SyncError('CURSOR_AHEAD', 'x');
      for (const ch of changes) v.records.set(ch.id, { seq: ++v.seq, blob: ch.blob });
      const out = [...v.records.entries()]
        .filter(([, r]) => r.seq > since)
        .sort((a, b) => a[1].seq - b[1].seq)
        .map(([id, r]) => ({ id, seq: r.seq, blob: r.blob }));
      return { seq: v.seq, more: false, changes: out };
    },
    async deleteVault(token) {
      vaults.delete(token);
    },
  };
  return { transport, vaults, calls };
}

let dbSeq = 0;
const openRepo = (now?: () => number) => Repo.open(`teste-${dbSeq++}`, now);

describe('sincronização entre aparelhos', () => {
  it('dois aparelhos convergem, com edição, exclusão e conteúdo ilegível no servidor', async () => {
    const keys = await deriveKeys(KEY);
    const server = memoryServer();
    await server.transport.createVault(keys.vaultId, keys.authToken);
    const a = await openRepo();
    const b = await openRepo();

    await a.put('texto', '2026-10-02', { done: true, note: 'nota secreta' });
    await a.put('saida', 's1', { date: '2026-10-02', min: 90, kind: 'Casa em casa' });
    let ca = (await runSync(a, keys, server.transport, 0)).cursor;
    expect(a.dirtyRecords()).toHaveLength(0);

    const blobs = [...server.vaults.get(keys.authToken)!.records.values()].map((r) => r.blob).join('');
    expect(blobs).not.toContain('nota');
    expect(blobs).not.toContain('texto');

    let cb = (await runSync(b, keys, server.transport, 0)).cursor;
    expect(b.get('texto', '2026-10-02')).toEqual({ done: true, note: 'nota secreta' });

    await b.put('texto', '2026-10-02', { done: true, note: 'editada no B' });
    await b.remove('saida', 's1');
    cb = (await runSync(b, keys, server.transport, cb)).cursor;
    ca = (await runSync(a, keys, server.transport, ca)).cursor;
    expect(a.get<{ note: string }>('texto', '2026-10-02')?.note).toBe('editada no B');
    expect(a.list('saida')).toHaveLength(0);
    expect(ca).toBe(cb);
  });

  it('em edições simultâneas, vence a mais recente', async () => {
    const keys = await deriveKeys(KEY);
    const server = memoryServer();
    await server.transport.createVault(keys.vaultId, keys.authToken);
    let t = 1_000_000;
    const a = await openRepo(() => t);
    const b = await openRepo(() => t);
    await a.put('config', 'main', { tema: 'claro' });
    t += 10;
    await b.put('config', 'main', { tema: 'escuro' });
    await runSync(a, keys, server.transport, 0);
    await runSync(b, keys, server.transport, 0);
    await runSync(a, keys, server.transport, 0);
    expect(a.get('config', 'main')).toEqual({ tema: 'escuro' });
    expect(b.get('config', 'main')).toEqual({ tema: 'escuro' });
  });

  it('se o servidor voltou de um backup antigo, reenvia tudo', async () => {
    const keys = await deriveKeys(KEY);
    const server = memoryServer();
    await server.transport.createVault(keys.vaultId, keys.authToken);
    const a = await openRepo();
    await a.put('texto', '2026-10-02', { done: true });
    const r1 = await runSync(a, keys, server.transport, 0);
    // "Restaura" o servidor vazio.
    server.vaults.set(keys.authToken, { vaultId: keys.vaultId, seq: 0, records: new Map() });
    const r2 = await runSync(a, keys, server.transport, r1.cursor);
    expect(r2.pushed).toBe(1);
    expect(server.vaults.get(keys.authToken)!.records.size).toBe(1);
  });

  it('ignora blobs trocados de lugar pelo servidor', async () => {
    const keys = await deriveKeys(KEY);
    const server = memoryServer();
    await server.transport.createVault(keys.vaultId, keys.authToken);
    const a = await openRepo();
    await a.put('texto', '2026-10-02', { done: true });
    await a.put('texto', '2026-10-03', { done: false });
    await runSync(a, keys, server.transport, 0);
    const recs = server.vaults.get(keys.authToken)!.records;
    const [[id1, r1], [id2, r2]] = [...recs.entries()];
    recs.set(id1, { ...r1, blob: r2.blob });
    recs.set(id2, { ...r2, blob: r1.blob });
    const b = await openRepo();
    const res = await runSync(b, keys, server.transport, 0);
    expect(res.skipped).toBe(2);
    expect(b.list('texto')).toHaveLength(0);
  });
});

describe('pareamento', () => {
  it('ao parear, as configurações do cofre prevalecem sobre as do aparelho novo', async () => {
    const keys = await deriveKeys(KEY);
    const server = memoryServer();
    await server.transport.createVault(keys.vaultId, keys.authToken);
    let t = 1_000_000;
    const a = await openRepo(() => t);
    await a.put('config', 'main', { tema: 'escuro', midDay: 4 });
    await a.put('semana', '2026-10-05', { book: 24, from: 40, to: 41, lessons: [] });
    await runSync(a, keys, server.transport, 0);
    t += 60_000;
    const b = await openRepo(() => t);
    await b.put('config', 'main', { tema: 'claro', midDay: 3 });
    await b.put('texto', '2026-10-04', { done: true });
    const pulled = await pullAll(b, keys, server.transport, ['config']);
    expect(b.get('config', 'main')).toEqual({ tema: 'escuro', midDay: 4 });
    await b.markAllDirty();
    await runSync(b, keys, server.transport, pulled.cursor);
    await runSync(a, keys, server.transport, 0);
    expect(a.get('config', 'main')).toEqual({ tema: 'escuro', midDay: 4 });
    expect(a.get('texto', '2026-10-04')).toEqual({ done: true });
    expect(b.get('semana', '2026-10-05')).toMatchObject({ book: 24 });
  });
});

describe('metadados do áudio oficial', () => {
  it('lê duração, URL e marcadores', () => {
    expect(parseTime('00:00:02.469')).toBeCloseTo(2.469);
    expect(parseTime('01:02:03.5')).toBeCloseTo(3723.5);
    const a = parseChapterAudio(chapterApiResponse)!;
    expect(a.url).toMatch(/^https:\/\/cfp2\.jw-cdn\.org\//);
    expect(a.duration).toBe(227.64);
    expect(a.starts.slice(0, 2)).toEqual([2.634, 19]);
    expect(parseChapterAudio({ files: { T: { MP3: [{ file: { url: 'https://golpe.example/x.mp3' }, duration: 10 }] } } })).toBeNull();
  });

  it('associa os artigos de estudo às semanas', () => {
    const arts = parseStudyIssue(issueApiResponse, '202608');
    expect(arts.map((a) => a.start)).toEqual(['2026-10-05', '2026-10-12']);
    expect(arts[0].docid).toBe(2026520);
    expect(arts[1].docid).toBeNull();
  });
});
