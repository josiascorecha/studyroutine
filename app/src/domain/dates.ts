/** Datas como texto 'AAAA-MM-DD' (chave de dia), sempre calculadas em UTC para não sofrer com fuso. */
export type DayKey = string;

export const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const DAY_MS = 86_400_000;
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function pad(n: number | string, w: number): string {
  return String(n).padStart(w, '0');
}

export function isDayKey(k: unknown): k is DayKey {
  return typeof k === 'string' && KEY_RE.test(k) && msToKey(keyToMs(k)) === k;
}

export function keyToMs(k: DayKey): number {
  const [y, m, d] = k.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function msToKey(ms: number): DayKey {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

export function addDays(k: DayKey, n: number): DayKey {
  return msToKey(keyToMs(k) + n * DAY_MS);
}

/** 0 = domingo … 6 = sábado. */
export function weekday(k: DayKey): number {
  return new Date(keyToMs(k)).getUTCDay();
}

/** Segunda-feira da semana (as semanas da apostila vão de segunda a domingo). */
export function monday(k: DayKey): DayKey {
  return addDays(k, -((weekday(k) + 6) % 7));
}

export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((keyToMs(b) - keyToMs(a)) / DAY_MS);
}

export function dm(k: DayKey): string {
  const d = new Date(keyToMs(k));
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

/** "qui, 1/10" */
export function shortDay(k: DayKey): string {
  return `${DIAS_CURTOS[weekday(k)]}, ${dm(k)}`;
}

/** "quarta" */
export function dayWord(k: DayKey): string {
  return DIAS[weekday(k)].replace('-feira', '');
}

/** "quarta, 7/10" */
export function dayWordDm(k: DayKey): string {
  return `${dayWord(k)}, ${dm(k)}`;
}

export function cap(x: string): string {
  return x.charAt(0).toUpperCase() + x.slice(1);
}

/** "Sexta-feira, 2 de outubro" */
export function longDay(k: DayKey): string {
  const d = new Date(keyToMs(k));
  return `${cap(DIAS[weekday(k)])}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

/** "outubro de 2026" */
export function monthLabel(k: DayKey): string {
  const d = new Date(keyToMs(k));
  return `${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

export function lastDayOfMonth(k: DayKey): DayKey {
  const d = new Date(keyToMs(k));
  return msToKey(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

/** Dia local do aparelho (não UTC): é o "hoje" que a pessoa vê no calendário. */
export function localDayKey(date = new Date()): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

/** '19:30' → '19h30'; '09:00' → '9h'. */
export function fmtTime(t: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? '');
  if (!m) return '';
  const h = String(Number(m[1]));
  return m[2] === '00' ? `${h}h` : `${h}h${m[2]}`;
}

/** Minutos → "1h30", "45 min". */
export function fmtMinutes(min: number): string {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h${pad(m, 2)}` : `${h}h`;
}

/** Segundos de áudio → "≈ 4 min". */
export function fmtAudio(sec: number | null | undefined): string {
  if (sec == null) return '';
  if (sec < 45) return 'menos de 1 min';
  return `≈ ${Math.max(1, Math.round(sec / 60))} min`;
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60, 2)}`;
}
