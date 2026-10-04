import { addDays, MESES, pad, type DayKey } from './dates';

/**
 * Os títulos dos MP3 oficiais de A Sentinela (edição de estudo) trazem a semana de estudo entre parênteses,
 * por exemplo "Ajude outros a conhecer a Jeová (28 de setembro—4 de outubro)" ou "… (5-11 de outubro)".
 * Isso permite saber qual artigo é de qual semana pelos próprios metadados de download, sem ler páginas.
 */
const RANGE =
  /\((\d{1,2})(?:\s+de\s+([a-zç]+))?(?:\s+de\s+(\d{4}))?\s*[-–—]\s*(\d{1,2})\s+de\s+([a-zç]+)(?:\s+de\s+(\d{4}))?\)\s*$/i;

export interface StudyWeek {
  start: DayKey;
  end: DayKey;
  /** Título sem a semana entre parênteses. */
  title: string;
}

function monthIndex(name: string): number {
  return MESES.indexOf(name.toLowerCase());
}

/** issueYear/issueMonth: edição (ex.: 2026, 7 para julho). As semanas de estudo vêm cerca de 2 meses depois. */
export function parseStudyWeek(title: string, issueYear: number, issueMonth: number): StudyWeek | null {
  const m = RANGE.exec(title.trim());
  if (!m) return null;
  const endMonth = monthIndex(m[5]);
  const startMonth = m[2] ? monthIndex(m[2]) : endMonth;
  if (endMonth < 0 || startMonth < 0) return null;
  const endYear = m[6] ? Number(m[6]) : endMonth + 1 >= issueMonth ? issueYear : issueYear + 1;
  const startYear = m[3] ? Number(m[3]) : startMonth > endMonth ? endYear - 1 : endYear;
  const start = `${startYear}-${pad(startMonth + 1, 2)}-${pad(Number(m[1]), 2)}`;
  const end = `${endYear}-${pad(endMonth + 1, 2)}-${pad(Number(m[4]), 2)}`;
  if (addDays(start, 6) !== end) return null;
  return { start, end, title: title.replace(RANGE, '').replace(/\s+/g, ' ').trim() };
}

/** Edições candidatas para a semana (a de 2 meses antes e a de 3 meses antes), no formato 'AAAAMM'. */
export function candidateIssues(weekStart: DayKey): string[] {
  const [y, m] = weekStart.split('-').map(Number);
  const out: string[] = [];
  for (const back of [2, 3, 1]) {
    let mm = m - back;
    let yy = y;
    while (mm <= 0) {
      mm += 12;
      yy -= 1;
    }
    out.push(`${yy}${pad(mm, 2)}`);
  }
  return out;
}
