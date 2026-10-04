import { bookName, verseCount } from './bible';
import { addDays, type DayKey } from './dates';

/** Trecho da semana, informado pela pessoa a partir da apostila (capítulos inclusive). */
export interface WeekReading {
  book: number;
  from: number;
  to: number;
}

/** Metadados do áudio oficial de um capítulo: início de cada versículo em segundos (índice = versículo − 1). */
export interface ChapterAudio {
  url: string;
  duration: number;
  starts: (number | undefined)[];
}

export interface Unit {
  c: number;
  v: number;
  /** Versículos do capítulo. */
  n: number;
  /** Duração do versículo no áudio oficial (null quando o áudio ainda não foi baixado). */
  dur: number | null;
}

export interface Ref {
  c: number;
  v: number;
}

export type ReadVia = 'leitura' | 'audio' | 'alexa';

/** Registro imutável: "neste dia li/ouvi deste versículo até aquele". */
export interface ReadingEvent {
  date: DayKey;
  from: Ref;
  to: Ref;
  via: ReadVia;
}

export type SplitMode = 'capitulos' | 'versos' | 'minutos';

/** Completa marcadores ausentes por interpolação (ex.: Jer 39 não tem marcador do v. 12). */
export function filledStarts(audio: ChapterAudio, n: number): number[] {
  const out: number[] = [];
  for (let v = 1; v <= n; v++) out.push(v === 1 ? 0 : (audio.starts[v - 1] ?? NaN));
  for (let i = 1; i < n; i++) {
    if (!Number.isNaN(out[i])) continue;
    let j = i + 1;
    while (j < n && Number.isNaN(out[j])) j++;
    const prev = out[i - 1];
    const next = j < n ? out[j] : audio.duration;
    const step = (next - prev) / (j - i + 1);
    for (let k = i; k < j; k++) out[k] = prev + step * (k - i + 1);
  }
  return out;
}

export function buildUnits(r: WeekReading, audio: (chapter: number) => ChapterAudio | undefined): Unit[] {
  const units: Unit[] = [];
  for (let c = r.from; c <= r.to; c++) {
    const a = audio(c);
    const fromAudio = a ? a.starts.length : 0;
    const n = Math.max(verseCount(r.book, c), fromAudio);
    const starts = a ? filledStarts(a, n) : null;
    for (let v = 1; v <= n; v++) {
      const dur = starts && a ? (v === n ? a.duration : starts[v]) - starts[v - 1] : null;
      units.push({ c, v, n, dur: dur == null ? null : Math.max(0, dur) });
    }
  }
  return units;
}

export function unitIndex(units: Unit[], ref: Ref): number {
  return units.findIndex((u) => u.c === ref.c && u.v === ref.v);
}

export function portionRefs(units: Unit[], from: number, to: number): { from: Ref; to: Ref } {
  return { from: { c: units[from].c, v: units[from].v }, to: { c: units[to - 1].c, v: units[to - 1].v } };
}

/** "Jeremias 40:1–7", "Jeremias 40:15–41:5", "Jeremias 40–41". */
export function portionLabel(book: number, units: Unit[], from: number, to: number): string {
  if (to <= from) return '';
  const a = units[from];
  const b = units[to - 1];
  const name = bookName(book);
  if (a.v === 1 && b.v === b.n) return `${name} ${a.c === b.c ? a.c : `${a.c}–${b.c}`}`;
  if (a.c === b.c) return `${name} ${a.c}:${a.v === b.v ? a.v : `${a.v}–${b.v}`}`;
  return `${name} ${a.c}:${a.v}–${b.c}:${b.v}`;
}

export function portionSeconds(units: Unit[], from: number, to: number): number | null {
  let s = 0;
  for (let i = from; i < to; i++) {
    const d = units[i].dur;
    if (d == null) return null;
    s += d;
  }
  return s;
}

export function chaptersIn(units: Unit[], from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i < to; i++) if (!out.includes(units[i].c)) out.push(units[i].c);
  return out;
}

export interface AudioSegment {
  chapter: number;
  url: string;
  start: number;
  end: number;
}

/** Trechos de áudio para tocar exatamente a porção (um por capítulo). Null se faltar o áudio de algum capítulo. */
export function portionSegments(units: Unit[], from: number, to: number, audio: (c: number) => ChapterAudio | undefined): AudioSegment[] | null {
  const segs: AudioSegment[] = [];
  for (const c of chaptersIn(units, from, to)) {
    const a = audio(c);
    if (!a) return null;
    const inChapter = units.slice(from, to).filter((u) => u.c === c);
    const n = inChapter[0].n;
    const starts = filledStarts(a, n);
    const first = inChapter[0].v;
    const last = inChapter[inChapter.length - 1].v;
    segs.push({ chapter: c, url: a.url, start: first === 1 ? 0 : starts[first - 1], end: last === n ? a.duration : starts[last] });
  }
  return segs;
}

/** Até onde a pessoa já leu (índice do próximo versículo). Eventos fora do trecho atual são ignorados. */
export function progressOf(units: Unit[], events: ReadingEvent[]): number {
  let p = 0;
  for (const e of events) {
    const i = unitIndex(units, e.to);
    if (i >= 0) p = Math.max(p, i + 1);
  }
  return p;
}

/** Divide os versículos restantes em m dias, conforme o modo escolhido. */
export function splitLens(units: Unit[], start: number, m: number, mode: SplitMode): number[] {
  const lens: number[] = Array.from({ length: Math.max(0, m) }, () => 0);
  const R = units.length - start;
  if (m <= 0 || R <= 0) return lens;
  const hasDur = units.slice(start).every((u) => u.dur != null);
  if (mode === 'capitulos') {
    const groups: { c: number; len: number }[] = [];
    for (let i = start; i < units.length; i++) {
      const g = groups[groups.length - 1];
      if (g && g.c === units[i].c) g.len++;
      else groups.push({ c: units[i].c, len: 1 });
    }
    const k = groups.length;
    groups.forEach((g, j) => {
      lens[Math.min(m - 1, Math.floor((j * m) / k))] += g.len;
    });
    return lens;
  }
  if (mode === 'minutos' && hasDur) {
    let total = 0;
    for (let i = start; i < units.length; i++) total += units[i].dur!;
    let cum = 0;
    for (let i = start; i < units.length; i++) {
      const mid = cum + units[i].dur! / 2;
      lens[Math.min(m - 1, Math.floor(mid / (total / m)))]++;
      cum += units[i].dur!;
    }
    return lens;
  }
  const base = Math.floor(R / m);
  const extra = R % m;
  for (let d = 0; d < m; d++) lens[d] = base + (d < extra ? 1 : 0);
  return lens;
}

export type RowStatus = 'lido' | 'hoje' | 'planejado' | 'folga' | 'perdido' | 'antes';

export interface PlanRow {
  date: DayKey;
  status: RowStatus;
  from?: number;
  to?: number;
  via?: ReadVia;
}

export interface ReadingPlan {
  units: Unit[];
  total: number;
  progress: number;
  rows: PlanRow[];
  todayRange: [number, number] | null;
  todayDone: PlanRow | null;
  nextRow: PlanRow | null;
  /** Algum dia depois do início do uso ficou sem leitura (o restante foi redistribuído). */
  missed: boolean;
  /** Dia da reunião com leitura pendente: o restante vai todo para hoje. */
  catchUp: boolean;
  totalSeconds: number | null;
}

export interface PlanInput {
  units: Unit[];
  events: ReadingEvent[];
  start: DayKey;
  end: DayKey;
  meeting: DayKey;
  cur: DayKey;
  /** Dia em que a pessoa começou a usar o app: dias anteriores não contam como atraso. */
  installDay: DayKey;
  mode: SplitMode;
}

export function planWeek(input: PlanInput): ReadingPlan {
  const { units, cur } = input;
  const byDate = new Map<DayKey, ReadingEvent>();
  for (const e of input.events) {
    const prev = byDate.get(e.date);
    if (!prev || unitIndex(units, e.to) > unitIndex(units, prev.to)) byDate.set(e.date, e);
  }
  const progress = progressOf(units, input.events);
  const days: DayKey[] = [];
  for (let k = input.start; k <= input.end; k = addDays(k, 1)) days.push(k);
  const todayEvent = byDate.get(cur);
  const todayDone = !!todayEvent && unitIndex(units, todayEvent.to) >= 0;
  let rem = days.filter((d) => d > cur || (d === cur && !todayDone));
  let catchUp = false;
  if (!rem.length && !todayDone && cur <= input.meeting && progress < units.length) {
    rem = [cur];
    catchUp = true;
  }
  const lens = splitLens(units, progress, rem.length, input.mode);
  const plan = new Map<DayKey, [number, number]>();
  let pos = progress;
  rem.forEach((d, i) => {
    plan.set(d, [pos, pos + lens[i]]);
    pos += lens[i];
  });
  const rowDays = [...days];
  if ((catchUp || todayDone) && !rowDays.includes(cur)) rowDays.push(cur);
  let missed = false;
  const rows: PlanRow[] = rowDays.map((date) => {
    const e = byDate.get(date);
    if (e) {
      const a = unitIndex(units, e.from);
      const b = unitIndex(units, e.to);
      if (a >= 0 && b >= 0) return { date, status: 'lido', from: a, to: b + 1, via: e.via };
    }
    const p = plan.get(date);
    if (p) {
      if (p[1] <= p[0]) return { date, status: 'folga' };
      return { date, status: date === cur ? 'hoje' : 'planejado', from: p[0], to: p[1] };
    }
    if (date < input.installDay) return { date, status: 'antes' };
    if (date < cur) missed = true;
    return { date, status: 'perdido' };
  });
  const tr = plan.get(cur);
  const todayRange: [number, number] | null = tr && tr[1] > tr[0] ? tr : null;
  const nextRow = rows.find((r) => r.date > cur && r.status === 'planejado') ?? null;
  return {
    units,
    total: units.length,
    progress,
    rows,
    todayRange,
    todayDone: todayDone ? rows.find((r) => r.date === cur && r.status === 'lido') ?? null : null,
    nextRow,
    missed: missed && progress < units.length,
    catchUp,
    totalSeconds: portionSeconds(units, 0, units.length),
  };
}
