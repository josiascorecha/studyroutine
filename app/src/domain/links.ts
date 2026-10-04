import type { DayKey } from './dates';
import { pad } from './dates';

/**
 * Links para o conteúdo oficial. O app não guarda nem mostra textos de publicações:
 * só monta o endereço certo e abre no JW Library ou no navegador.
 * Formatos conferidos em 02/10/2026 (ver docs/fontes-oficiais.md).
 */
const LOCALE = 'T'; // português (Brasil) no jw.org
const WOL = 'https://wol.jw.org/pt/wol';
const WOL_LIB = 'r5/lp-t';

const compact = (k: DayKey) => k.replace(/-/g, '');

export const links = {
  dailyText: (day: DayKey) => `https://www.jw.org/finder?wtlocale=${LOCALE}&alias=daily-text&date=${compact(day)}`,
  /** O próprio jw.org descobre a semana da programação a partir da data. */
  meetings: (day: DayKey) => `https://www.jw.org/finder?wtlocale=${LOCALE}&alias=meetings&date=${compact(day)}`,
  /** Trecho bíblico na Tradução do Novo Mundo (edição de estudo). */
  bible: (book: number, c1: number, v1: number, c2: number, v2: number) =>
    `https://www.jw.org/finder?wtlocale=${LOCALE}&prefer=lang&pub=nwtsty&bible=${bibleCode(book, c1, v1)}-${bibleCode(book, c2, v2)}`,
  wolChapter: (book: number, chapter: number) => `${WOL}/b/${WOL_LIB}/nwtsty/${book}/${chapter}`,
  wolDoc: (docid: number | string) => `${WOL}/d/${WOL_LIB}/${docid}`,
  wolSearch: (q: string) => `${WOL}/s/${WOL_LIB}?q=${encodeURIComponent(q)}`,
  publication: (symbol: string) => `${WOL}/publication/${WOL_LIB}/${symbol}`,
  lmd: () => `${WOL}/publication/${WOL_LIB}/lmd`,
  lff: () => `${WOL}/publication/${WOL_LIB}/lff`,
  alexaSkill: () => 'https://www.amazon.com.br/dp/B07YSRTQ27',
  alexaHelp: () => 'https://www.jw.org/pt/ajuda-online/como-usar-jw-org/skills-para-amazon-alexa/',
};

/** Código do trecho: livro (sem zero à esquerda) + capítulo (3 dígitos) + versículo (3 dígitos). */
export function bibleCode(book: number, chapter: number, verse: number): string {
  return `${book}${pad(chapter, 3)}${pad(verse, 3)}`;
}

/** Só links https do jw.org e subdomínios. */
export function isOfficialUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
    const host = u.hostname.toLowerCase();
    return host === 'jw.org' || host.endsWith('.jw.org');
  } catch {
    return false;
  }
}
