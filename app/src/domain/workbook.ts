import { BOOK_NAMES, chapterCount } from './bible';
import { addDays, MESES, pad, type DayKey } from './dates';

/**
 * Leitura da semana pelos metadados oficiais de download da Apostila Vida e Ministério (mwb).
 * Os títulos dos arquivos trazem a semana e o trecho bíblico, por exemplo
 * "5 a 11 de outubro (Jeremias 40 a 41)" ou "28 de dezembro a 3 de janeiro (Ezequiel 9 a 10)".
 * O app lê só esses títulos, sem abrir páginas nem o conteúdo da apostila.
 */
export interface WorkbookWeek {
  /** Segunda-feira da semana. */
  start: DayKey;
  book: number;
  from: number;
  to: number;
}

const TITLE = /^(\d{1,2})(?:\.º)?(?:\s+de\s+([a-zç]+))?\s+a\s+(\d{1,2})(?:\.º)?\s+de\s+([a-zç]+)\s*\((.+)\)\s*$/i;
const REF = /^(.+?)\s+(\d{1,3})(?:\s*(?:a|-|–)\s*(\d{1,3}))?$/;

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const BOOKS = new Map<string, number>(BOOK_NAMES.map((n, i) => [norm(n), i + 1]));

export function bookNumber(name: string): number | null {
  return BOOKS.get(norm(name)) ?? null;
}

/** issueYear/issueMonth: edição da apostila (ex.: 2026 e 9 para a de setembro–outubro). */
export function parseWorkbookWeek(title: string, issueYear: number, issueMonth: number): WorkbookWeek | null {
  const m = TITLE.exec(title.replace(/<[^>]+>/g, '').trim());
  if (!m) return null;
  const endMonth = MESES.indexOf(m[4].toLowerCase());
  const startMonth = m[2] ? MESES.indexOf(m[2].toLowerCase()) : endMonth;
  if (endMonth < 0 || startMonth < 0) return null;
  const startYear = startMonth + 1 >= issueMonth ? issueYear : issueYear + 1;
  const start = `${startYear}-${pad(startMonth + 1, 2)}-${pad(Number(m[1]), 2)}`;
  const endYear = endMonth < startMonth ? startYear + 1 : startYear;
  const end = `${endYear}-${pad(endMonth + 1, 2)}-${pad(Number(m[3]), 2)}`;
  if (addDays(start, 6) !== end) return null;

  const r = REF.exec(m[5].trim());
  if (!r) return null;
  const book = bookNumber(r[1]);
  if (!book) return null;
  const from = Number(r[2]);
  const to = r[3] ? Number(r[3]) : from;
  if (from < 1 || to < from || to > chapterCount(book)) return null;
  return { start, book, from, to };
}

/** Edições candidatas (bimestrais, meses ímpares) para a semana que começa em `week`: a provável e a anterior. */
export function workbookIssues(week: DayKey): string[] {
  const [y, m] = week.split('-').map(Number);
  const out: string[] = [];
  let mm = m % 2 === 1 ? m : m - 1;
  let yy = y;
  for (let i = 0; i < 2; i++) {
    out.push(`${yy}${pad(mm, 2)}`);
    mm -= 2;
    if (mm <= 0) {
      mm += 12;
      yy -= 1;
    }
  }
  return out;
}
