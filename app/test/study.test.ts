import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allThemes, BUNDLED, loadCatalog, parseCatalog, themeLabel } from '../src/app/catalog';
import { Repo } from '../src/data/repo';
import { nextOnWeekday } from '../src/ui/screens/Study';

describe('catálogo de sugestões', () => {
  it('a cópia embutida no app é igual à do servidor', () => {
    const server = JSON.parse(readFileSync(new URL('../../server/catalog/catalogo.json', import.meta.url), 'utf8'));
    expect(BUNDLED).toEqual(parseCatalog(server));
    expect(BUNDLED.itens.length).toBeGreaterThan(5);
  });

  it('descarta itens com link fora do jw.org, campos inválidos ou id repetido', () => {
    const base = { id: 'a', titulo: 'T', descricao: 'D', url: 'https://wol.jw.org/pt/wol/d/r5/lp-t/1', temas: ['x'], publico: 'todos', tipo: 'artigo' };
    const cat = parseCatalog({
      versao: '2026-10-04',
      itens: [
        base,
        { ...base, id: 'b', url: 'https://exemplo.com.br/x' },
        { ...base, id: 'c', url: 'http://www.jw.org/pt/' },
        { ...base, id: 'd', tipo: 'podcast' },
        { ...base },
        { ...base, id: 'e', url: 'https://www.jw.org/pt/biblioteca/' },
      ],
    });
    expect(cat?.itens.map((i) => i.id)).toEqual(['a', 'e']);
    expect(parseCatalog({ versao: 1, itens: [] })).toBeNull();
    expect(parseCatalog(null)).toBeNull();
  });

  it('usa o cache quando o servidor está fora do ar e atualiza quando há versão nova', async () => {
    const repo = await Repo.open(`cat-${Math.random()}`);
    const srv = 'https://studyroutine.exemplo.com.br';
    const off = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    expect((await loadCatalog(repo, off, srv)).versao).toBe(BUNDLED.versao);
    const novo = { versao: '2099-01-01', itens: [{ ...BUNDLED.itens[0], id: 'novo' }] };
    const urls: string[] = [];
    const on = ((u: string) => {
      urls.push(u);
      return Promise.resolve(new Response(JSON.stringify(novo)));
    }) as unknown as typeof fetch;
    expect((await loadCatalog(repo, on, srv)).itens[0].id).toBe('novo');
    expect(urls).toEqual([`${srv}/api/v1/catalogo`]);
    // Depois, mesmo sem rede, fica com a versão nova guardada no aparelho.
    expect((await loadCatalog(repo, off, srv)).versao).toBe('2099-01-01');
    // Uma resposta mais antiga que a guardada não substitui a atual.
    const velho = (() => Promise.resolve(new Response(JSON.stringify(BUNDLED)))) as unknown as typeof fetch;
    expect((await loadCatalog(repo, velho, srv)).versao).toBe('2099-01-01');
  });

  it('rótulos de tema legíveis', () => {
    expect(themeLabel('adoracao-em-familia')).toBe('Adoração em família');
    expect(themeLabel('vida-em-familia')).toBe('Vida em familia');
    expect(allThemes(BUNDLED)).toContain('estudo-pessoal');
  });
});

describe('adoração em família', () => {
  it('próxima data no dia escolhido, contando hoje', () => {
    expect(nextOnWeekday('2026-10-02', 5)).toBe('2026-10-02'); // sexta
    expect(nextOnWeekday('2026-10-02', 1)).toBe('2026-10-05'); // segunda
    expect(nextOnWeekday('2026-10-04', 6)).toBe('2026-10-10'); // sábado seguinte
  });
});
