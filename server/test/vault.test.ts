import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { blob, device, startApp, uuid, type Ctx } from './helpers.js';

let ctx: Ctx | null = null;
afterEach(async () => {
  await ctx?.close();
  ctx = null;
});

describe('saúde e informações', () => {
  it('responde /api/health e /api/v1/info sem dados pessoais', async () => {
    ctx = await startApp();
    const h = await ctx.app.inject({ method: 'GET', url: '/api/health' });
    expect(h.statusCode).toBe(200);
    expect(h.headers['cache-control']).toBe('no-store');
    const i = await ctx.app.inject({ method: 'GET', url: '/api/v1/info' });
    expect(i.json().service).toBe('studyroutine');
  });
});

describe('criação do cofre', () => {
  it('cria, é idempotente para o mesmo par chave/id e recusa combinações diferentes', async () => {
    ctx = await startApp();
    const a = device(ctx.app);
    expect((await a.create()).status).toBe(201);
    expect((await a.create()).status).toBe(200);

    // Outro aparelho com a mesma chave (mesmo token e mesmo id) entra no mesmo cofre.
    const a2 = device(ctx.app, { token: a.token, vaultId: a.vaultId });
    expect((await a2.create()).status).toBe(200);

    const sameIdOtherToken = device(ctx.app, { vaultId: a.vaultId });
    expect((await sameIdOtherToken.create()).status).toBe(409);
    const sameTokenOtherId = device(ctx.app, { token: a.token });
    expect((await sameTokenOtherId.create()).status).toBe(409);
  });

  it('exige token e id válidos', async () => {
    ctx = await startApp();
    const d = device(ctx.app);
    const semToken = await d.raw('POST', '/api/v1/vaults', { vaultId: d.vaultId.toString('base64url') }, false);
    expect(semToken.status).toBe(401);
    const idRuim = await d.raw('POST', '/api/v1/vaults', { vaultId: 'curto' });
    expect(idRuim.status).toBe(400);
  });

  it('limita a criação de cofres por IP', async () => {
    ctx = await startApp({ VAULTS_PER_IP_PER_DAY: '2' });
    const ip = '198.51.100.7';
    expect((await device(ctx.app, { ip }).create()).status).toBe(201);
    expect((await device(ctx.app, { ip }).create()).status).toBe(201);
    expect((await device(ctx.app, { ip }).create()).status).toBe(429);
  });
});

describe('sincronização', () => {
  it('envia, recebe pelo cursor e entrega a versão mais nova a outro aparelho', async () => {
    ctx = await startApp();
    const a = device(ctx.app);
    await a.create();
    const r1 = uuid();
    const r2 = uuid();
    const b1 = blob(80);
    const s1 = await a.sync(0, [
      { id: r1, blob: b1 },
      { id: r2, blob: blob(80) },
    ]);
    expect(s1.status).toBe(200);
    expect(s1.body.seq).toBe(2);
    expect(s1.body.changes.map((c: any) => c.seq)).toEqual([1, 2]);

    const vazio = await a.sync(2);
    expect(vazio.body.changes).toEqual([]);

    const novo = blob(96);
    const s2 = await a.sync(2, [{ id: r1, blob: novo }]);
    expect(s2.body.seq).toBe(3);
    expect(s2.body.changes).toEqual([{ id: r1, seq: 3, blob: novo }]);

    const b = device(ctx.app, { token: a.token, vaultId: a.vaultId });
    const tudo = await b.sync(0);
    expect(tudo.body.changes).toHaveLength(2);
    const porId = Object.fromEntries(tudo.body.changes.map((c: any) => [c.id, c.blob]));
    expect(porId[r1]).toBe(novo);

    const st = await a.status();
    expect(st.body.records).toBe(2);
    expect(st.body.seq).toBe(3);
  });

  it('no mesmo lote, vale a última versão de um registro repetido', async () => {
    ctx = await startApp();
    const a = device(ctx.app);
    await a.create();
    const id = uuid();
    const ultimo = blob(40, 7);
    const r = await a.sync(0, [
      { id, blob: blob(40, 1) },
      { id, blob: ultimo },
    ]);
    expect(r.status).toBe(200);
    expect(r.body.changes).toHaveLength(1);
    expect(r.body.changes[0].blob).toBe(ultimo);
    expect((await a.status()).body.records).toBe(1);
  });

  it('pagina a leitura e não pula registros', async () => {
    ctx = await startApp({ PULL_PAGE_SIZE: '10' });
    const a = device(ctx.app);
    await a.create();
    const ids = Array.from({ length: 25 }, () => uuid());
    await a.sync(0, ids.map((id) => ({ id, blob: blob(32) })));
    const b = device(ctx.app, { token: a.token, vaultId: a.vaultId });
    const vistos: string[] = [];
    let cursor = 0;
    for (let i = 0; i < 5; i++) {
      const r = await b.sync(cursor);
      vistos.push(...r.body.changes.map((c: any) => c.id));
      cursor = r.body.changes.length ? r.body.changes[r.body.changes.length - 1].seq : cursor;
      if (!r.body.more) break;
    }
    expect(new Set(vistos)).toEqual(new Set(ids));
  });

  it('cofres não enxergam os registros uns dos outros', async () => {
    ctx = await startApp();
    const a = device(ctx.app);
    const b = device(ctx.app);
    await a.create();
    await b.create();
    await a.sync(0, [{ id: uuid(), blob: blob() }]);
    const rb = await b.sync(0);
    expect(rb.body.changes).toEqual([]);
    expect(rb.body.seq).toBe(0);
  });

  it('recusa cursor à frente do servidor (ex.: servidor restaurado de backup)', async () => {
    ctx = await startApp();
    const a = device(ctx.app);
    await a.create();
    const r = await a.sync(50);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('CURSOR_AHEAD');
  });

  it('valida identificadores e tamanho dos registros', async () => {
    ctx = await startApp({ RECORD_MAX_BYTES: '1024' });
    const a = device(ctx.app);
    await a.create();
    expect((await a.sync(0, [{ id: 'nao-e-uuid', blob: blob() }])).status).toBe(400);
    expect((await a.sync(0, [{ id: uuid(), blob: blob(2000) }])).status).toBe(400);
    expect((await a.sync(-1)).status).toBe(400);
  });

  it('aplica a cota do cofre sem gravar nada do lote recusado', async () => {
    ctx = await startApp({ VAULT_MAX_RECORDS: '10' });
    const a = device(ctx.app);
    await a.create();
    await a.sync(0, Array.from({ length: 8 }, () => ({ id: uuid(), blob: blob(16) })));
    const r = await a.sync(8, Array.from({ length: 3 }, () => ({ id: uuid(), blob: blob(16) })));
    expect(r.status).toBe(413);
    const st = await a.status();
    expect(st.body.records).toBe(8);
    expect(st.body.seq).toBe(8);
  });

  it('exige token válido e bloqueia tentativas repetidas do mesmo IP', async () => {
    ctx = await startApp({ AUTH_FAILURES_PER_IP: '5' });
    const ip = '192.0.2.44';
    const valido = device(ctx.app, { ip });
    await valido.create();
    for (let i = 0; i < 5; i++) {
      const intruso = device(ctx.app, { ip, token: randomBytes(32) });
      expect((await intruso.sync(0)).status).toBe(401);
    }
    // O IP ficou bloqueado por 15 minutos, mesmo com token válido.
    expect((await valido.sync(0)).status).toBe(401);
    // Outro IP com o token válido continua funcionando.
    const outroIp = device(ctx.app, { token: valido.token, vaultId: valido.vaultId });
    expect((await outroIp.sync(0)).status).toBe(200);
  });

  it('apaga o cofre e tudo dentro dele', async () => {
    ctx = await startApp();
    const a = device(ctx.app);
    await a.create();
    await a.sync(0, [{ id: uuid(), blob: blob() }]);
    expect((await a.remove()).status).toBe(204);
    expect((await a.sync(0)).status).toBe(401);
    const { rows } = await ctx.db.query('SELECT count(*)::int AS n FROM records');
    expect(rows[0].n).toBe(0);
  });
});

describe('CORS', () => {
  it('libera o app Android e a própria origem, e nega origens desconhecidas', async () => {
    ctx = await startApp();
    const pre = (origin: string) =>
      ctx!.app.inject({
        method: 'OPTIONS',
        url: '/api/v1/sync',
        headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' },
      });
    expect((await pre('https://localhost')).headers['access-control-allow-origin']).toBe('https://localhost');
    expect((await pre('http://localhost:3000')).headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect((await pre('https://site-estranho.example')).headers['access-control-allow-origin']).toBeUndefined();
  });
});
