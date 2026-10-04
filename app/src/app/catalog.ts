import { useEffect, useState } from 'react';
import { isOfficialUrl } from '../domain/links';
import type { Repo } from '../data/repo';
import { defaultServer } from './platform';
import inicial from './catalogo-inicial.json';

/**
 * Catálogo curado de sugestões: só links do jw.org com descrição própria (nenhum texto das publicações).
 * O app já vem com uma cópia (funciona offline) e atualiza pelo servidor quando houver rede.
 */
export interface CatalogItem {
  id: string;
  titulo: string;
  descricao: string;
  url: string;
  temas: string[];
  publico: 'todos' | 'criancas' | 'jovens' | 'familia';
  tipo: 'artigo' | 'video' | 'atividade' | 'guia' | 'publicacao';
}

export interface Catalog {
  versao: string;
  itens: CatalogItem[];
}

const PUBLICOS = ['todos', 'criancas', 'jovens', 'familia'];
const TIPOS = ['artigo', 'video', 'atividade', 'guia', 'publicacao'];
const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** Aceita só itens bem formados e com link oficial; descarta o resto em silêncio. */
export function parseCatalog(raw: unknown): Catalog | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { versao?: unknown; itens?: unknown };
  if (typeof r.versao !== 'string' || !Array.isArray(r.itens)) return null;
  const seen = new Set<string>();
  const itens: CatalogItem[] = [];
  for (const it of r.itens as Record<string, unknown>[]) {
    if (!it || typeof it !== 'object') continue;
    const ok =
      str(it.id, 80) &&
      str(it.titulo, 160) &&
      str(it.descricao, 400) &&
      typeof it.url === 'string' &&
      isOfficialUrl(it.url) &&
      Array.isArray(it.temas) &&
      it.temas.every((t) => str(t, 40)) &&
      PUBLICOS.includes(it.publico as string) &&
      TIPOS.includes(it.tipo as string) &&
      !seen.has(it.id as string);
    if (!ok) continue;
    seen.add(it.id as string);
    itens.push(it as unknown as CatalogItem);
  }
  return itens.length ? { versao: r.versao, itens } : null;
}

export const BUNDLED: Catalog = parseCatalog(inicial) ?? { versao: '', itens: [] };

const CACHE_KEY = 'catalogo';

export async function loadCatalog(repo: Repo, fetchImpl: typeof fetch = (...a) => fetch(...a), server = defaultServer()): Promise<Catalog> {
  const cached = parseCatalog(await repo.getCache<unknown>(CACHE_KEY));
  const base = cached && cached.versao >= BUNDLED.versao ? cached : BUNDLED;
  if (!server) return base;
  try {
    const res = await fetchImpl(`${server}/api/v1/catalogo`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return base;
    const fresh = parseCatalog(await res.json());
    if (fresh && fresh.versao >= base.versao) {
      await repo.setCache(CACHE_KEY, fresh);
      return fresh;
    }
  } catch {
    // Sem rede: fica com o que já tem.
  }
  return base;
}

export function useCatalog(repo: Repo): Catalog {
  const [cat, setCat] = useState<Catalog>(BUNDLED);
  useEffect(() => {
    let alive = true;
    void loadCatalog(repo).then((c) => alive && setCat(c));
    return () => {
      alive = false;
    };
  }, [repo]);
  return cat;
}

export const THEME_LABELS: Record<string, string> = {
  'estudo-pessoal': 'Estudo pessoal',
  'adoracao-em-familia': 'Adoração em família',
  'texto-diario': 'Texto diário',
  criancas: 'Crianças',
  jovens: 'Jovens',
  ministerio: 'Ministério',
  reunioes: 'Reuniões',
  'estudos-biblicos': 'Estudos bíblicos',
  designacoes: 'Designações',
  acessibilidade: 'Acessibilidade',
};

export function themeLabel(slug: string): string {
  if (THEME_LABELS[slug]) return THEME_LABELS[slug];
  const t = slug.replace(/-/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const TIPO_LABELS: Record<CatalogItem['tipo'], string> = {
  artigo: 'Artigo',
  video: 'Vídeo',
  atividade: 'Atividade',
  guia: 'Guia',
  publicacao: 'Publicação',
};

export function allThemes(cat: Catalog): string[] {
  const set = new Set<string>();
  for (const it of cat.itens) for (const t of it.temas) set.add(t);
  return [...set].sort((a, b) => themeLabel(a).localeCompare(themeLabel(b), 'pt-BR'));
}
