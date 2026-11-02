import { MESES, pad, type DayKey } from './dates';

/**
 * Índice do PDF oficial "Examine as Escrituras Diariamente" (baixado do jw.org, sem alteração).
 * O app usa a posição dos títulos de cada dia ("Segunda-feira, 2 de novembro") só para saber
 * que trecho da página mostrar. O texto não é copiado nem guardado: a tela mostra a própria
 * página do PDF, recortada no texto do dia.
 */
export interface PdfTextItem {
  str: string;
  /** Posição em pontos do PDF, origem embaixo à esquerda (como o pdf.js entrega). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfPageText {
  width: number;
  height: number;
  items: PdfTextItem[];
}

/** Um pedaço retangular de uma página: coluna inteira na largura, de `top` até `bottom` (em pontos, origem embaixo). */
export interface PdfSegment {
  page: number;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

export interface DailyTextIndex {
  year: number;
  /** 'MM-DD' → pedaços do PDF, na ordem de leitura. */
  days: Record<string, PdfSegment[]>;
}

const WEEKDAYS = ['domingo', 'segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sabado'];
const HEAD = new RegExp(`^(${WEEKDAYS.join('|')}),(\\d{1,2})(?:\\.[a-zº°]?)?de([a-z]+)$`);
const MONTHS = MESES.map((m) => m.normalize('NFD').replace(/[̀-ͯ]/g, ''));

/** Tira acentos (inclusive os soltos que o PDF usa, como "˜ a"), espaços e maiúsculas. */
export function normalizeHeading(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ˜´ˆ¸`¨^~]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function parseHeading(s: string): { day: number; month: number; weekday: number } | null {
  const m = HEAD.exec(normalizeHeading(s));
  if (!m) return null;
  const month = MONTHS.indexOf(m[3]) + 1;
  const day = Number(m[2]);
  if (month < 1 || day < 1 || day > 31) return null;
  return { day, month, weekday: WEEKDAYS.indexOf(m[1]) };
}

interface Column {
  page: number;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  heads: { y: number; h: number; day: number; month: number; weekday: number }[];
}

/** Uma ou duas colunas: há duas quando nada de texto passa pela faixa do meio da página. */
function columnsOf(page: PdfPageText, n: number): Column[] {
  const items = page.items.filter((i) => i.str.trim());
  if (!items.length) return [];
  const W = page.width;
  const bandL = W * 0.485;
  const bandR = W * 0.51;
  const crossing = items.filter((i) => i.x < bandR && i.x + i.w > bandL).length;
  // Uma diagramação de coluna única cruza o meio em quase toda linha; a de duas colunas, em nenhuma
  // (às vezes o pdf.js junta duas linhas vizinhas numa só, por isso a folga).
  const twoCols = crossing <= Math.max(1, items.length * 0.15);
  const groups = twoCols ? [items.filter((i) => i.x < W / 2), items.filter((i) => i.x >= W / 2)] : [items];
  const out: Column[] = [];
  groups.forEach((g, ci) => {
    if (!g.length) return;
    const x0 = twoCols ? (ci === 0 ? 0 : W / 2) : 0;
    const x1 = twoCols ? (ci === 0 ? W / 2 : W) : W;
    const lines = new Map<number, { y: number; h: number; s: string }>();
    for (const i of g) {
      const k = Math.round(i.y);
      const l = lines.get(k) ?? { y: i.y, h: i.h, s: '' };
      l.s += i.str;
      l.h = Math.max(l.h, i.h);
      lines.set(k, l);
    }
    const heads = [...lines.values()]
      .map((l) => ({ l, d: parseHeading(l.s) }))
      .filter((x) => x.d)
      .map(({ l, d }) => ({ y: l.y, h: l.h, day: d!.day, month: d!.month, weekday: d!.weekday }))
      .sort((a, b) => b.y - a.y);
    out.push({
      page: n,
      x0,
      x1,
      top: Math.max(...g.map((i) => i.y + i.h)) + 2,
      bottom: Math.min(...g.map((i) => i.y)) - 3,
      heads,
    });
  });
  return out;
}

/**
 * Monta o índice dia → pedaços do PDF. Devolve null se o PDF não tiver um dia de cada data do ano,
 * em ordem (layout diferente do esperado): aí o app cai para "Abrir no jw.org".
 */
export function buildDailyTextIndex(pages: PdfPageText[], year: number): DailyTextIndex | null {
  const cols = pages.flatMap((p, i) => columnsOf(p, i + 1));
  type Mark = { col: number; y: number; h: number; day: number; month: number; weekday: number };
  const marks: Mark[] = [];
  cols.forEach((c, ci) => c.heads.forEach((h) => marks.push({ col: ci, ...h })));

  const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 864e5;
  if (marks.length !== daysInYear) return null;
  let d = new Date(Date.UTC(year, 0, 1));
  for (const m of marks) {
    if (m.day !== d.getUTCDate() || m.month !== d.getUTCMonth() + 1 || m.weekday !== d.getUTCDay()) return null;
    d = new Date(d.getTime() + 864e5);
  }

  const days: Record<string, PdfSegment[]> = {};
  marks.forEach((m, i) => {
    const next = marks[i + 1];
    const segs: PdfSegment[] = [];
    for (let ci = m.col; ci < cols.length && ci <= m.col + 4; ci++) {
      const c = cols[ci];
      const top = ci === m.col ? m.y + m.h + 2 : c.top;
      const endsHere = next && next.col === ci;
      const bottom = endsHere ? next.y + next.h + 2 : c.bottom;
      if (top > bottom) segs.push({ page: c.page, x0: c.x0, x1: c.x1, top, bottom });
      if (endsHere || !next) break;
    }
    days[`${pad(m.month, 2)}-${pad(m.day, 2)}`] = segs;
  });
  return { year, days };
}

export function segmentsFor(index: DailyTextIndex, day: DayKey): PdfSegment[] | null {
  if (Number(day.slice(0, 4)) !== index.year) return null;
  return index.days[day.slice(5)] ?? null;
}
