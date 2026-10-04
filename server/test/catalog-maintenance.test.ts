import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isOfficialUrl, loadCatalog } from '../src/lib/catalog.js';
import { runMaintenance } from '../src/lib/maintenance.js';
import { bearerToken, decodeB64url } from '../src/lib/security.js';
import { CATALOG, blob, device, startApp, uuid, type Ctx } from './helpers.js';

let ctx: Ctx | null = null;
afterEach(async () => {
  await ctx?.close();
  ctx = null;
});

describe('catálogo', () => {
  it('aceita só https do jw.org e subdomínios', () => {
    expect(isOfficialUrl('https://wol.jw.org/pt/wol/d/r5/lp-t/2024247')).toBe(true);
    expect(isOfficialUrl('https://www.jw.org/pt/')).toBe(true);
    expect(isOfficialUrl('https://jw.org/')).toBe(true);
    expect(isOfficialUrl('http://www.jw.org/pt/')).toBe(false);
    expect(isOfficialUrl('https://jw.org.exemplo.com/')).toBe(false);
    expect(isOfficialUrl('https://exemplo.com/jw.org')).toBe(false);
    expect(isOfficialUrl('https://usuario@www.jw.org/')).toBe(false);
    expect(isOfficialUrl('https://fakejw.org/')).toBe(false);
  });

  it('o catálogo publicado é válido e é servido pela API', async () => {
    const cat = await loadCatalog(CATALOG);
    expect(cat.itens.length).toBeGreaterThan(5);
    ctx = await startApp();
    const r = await ctx.app.inject({ method: 'GET', url: '/api/v1/catalogo' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=3600');
    expect(r.json().itens.length).toBe(cat.itens.length);
  });

  it('recusa catálogo com link fora do jw.org ou id repetido', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'cat-'));
    const base = { id: 'abc', titulo: 'Título', descricao: 'Descrição', temas: ['x1'], publico: 'todos', tipo: 'artigo' };
    const f1 = path.join(dir, 'a.json');
    await writeFile(f1, JSON.stringify({ versao: '1', itens: [{ ...base, url: 'https://exemplo.com/' }] }));
    await expect(loadCatalog(f1)).rejects.toThrow(/jw.org/);
    const f2 = path.join(dir, 'b.json');
    const ok = { ...base, url: 'https://www.jw.org/pt/' };
    await writeFile(f2, JSON.stringify({ versao: '1', itens: [ok, ok] }));
    await expect(loadCatalog(f2)).rejects.toThrow(/repetido/);
  });
});

describe('segurança', () => {
  it('lê só tokens Bearer de 32 bytes em base64url', () => {
    const t = Buffer.alloc(32, 9).toString('base64url');
    expect(bearerToken(`Bearer ${t}`)?.length).toBe(32);
    expect(bearerToken(`bearer ${t}`)).toBeNull();
    expect(bearerToken(`Bearer ${t}x`)).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
    expect(decodeB64url('AAAA', 3)?.length).toBe(3);
    expect(decodeB64url('AAA=', 3)).toBeNull();
  });
});

describe('manutenção', () => {
  it('apaga cofres inativos além do prazo e mantém os ativos', async () => {
    ctx = await startApp();
    const velho = device(ctx.app);
    const novo = device(ctx.app);
    await velho.create();
    await novo.create();
    await velho.sync(0, [{ id: uuid(), blob: blob() }]);
    await ctx.db.query(`UPDATE vaults SET last_seen_at = now() - interval '600 days' WHERE id = $1`, [velho.vaultId]);
    const r = await runMaintenance(ctx.db, 548);
    expect(r.vaultsRemoved).toBe(1);
    expect((await velho.sync(0)).status).toBe(401);
    expect((await novo.sync(0)).status).toBe(200);
  });
});
