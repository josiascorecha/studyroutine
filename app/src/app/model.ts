import { chapterCount, isBook, nextChapter } from '../domain/bible';
import { localDayKey, type DayKey } from '../domain/dates';
import type { MeetingSettings } from '../domain/meetings';
import type { FieldSession, MinistryMode, Student } from '../domain/ministry';
import type { ReadingEvent, ReadVia, SplitMode, WeekReading } from '../domain/reading';
import type { Repo } from '../data/repo';

/** Tipos de registro (viajam cifrados; o servidor não vê estes nomes). */
export const T = {
  config: 'config',
  week: 'semana',
  reading: 'leitura',
  dailyText: 'texto',
  watchtower: 'sentinela',
  midweek: 'meio',
  assignment: 'designacao',
  session: 'saida',
  student: 'estudante',
  family: 'familia',
  link: 'link',
  seen: 'visto',
} as const;

export type Theme = 'claro' | 'escuro' | 'sistema';

export interface AppSettings extends MeetingSettings {
  onboarded: boolean;
  theme: Theme;
  simple: boolean;
  splitMode: SplitMode;
  mode: MinistryMode;
  /** Meta de horas informada pelo pioneiro (mês para auxiliar, ano de serviço para regular). */
  meta: number | null;
  alexa: boolean;
  dtTime: string;
  readTime: string;
  reminders: boolean;
  installDay: DayKey;
  /** Dia fixo da adoração em família (0 = domingo … 6 = sábado), ou null se não usa. */
  familyDay: number | null;
  /** Temas de interesse escolhidos (filtram as sugestões do catálogo). */
  themes: string[];
}

export function defaultSettings(today: DayKey = localDayKey()): AppSettings {
  return {
    onboarded: false,
    theme: 'sistema',
    simple: false,
    midDay: 3,
    midTime: '19:30',
    wkDay: 0,
    wkTime: '09:00',
    deadline: 'vespera',
    exceptions: {},
    splitMode: 'versos',
    mode: 'pub',
    meta: null,
    alexa: true,
    dtTime: '06:30',
    readTime: '20:00',
    reminders: true,
    installDay: today,
    familyDay: null,
    themes: [],
  };
}

export function getSettings(repo: Repo): AppSettings {
  const stored = repo.get<Partial<AppSettings>>(T.config, 'main') ?? {};
  return { ...defaultSettings(), ...stored, exceptions: { ...(stored.exceptions ?? {}) } };
}

export async function saveSettings(repo: Repo, patch: Partial<AppSettings>): Promise<void> {
  await repo.put(T.config, 'main', { ...getSettings(repo), ...patch });
}

export interface WeekRecord extends WeekReading {
  /** Lições do "Ame as Pessoas — Faça Discípulos" treinadas na reunião (opcional). */
  lessons: number[];
}

export interface DailyTextRecord {
  done: boolean;
  via: ReadVia | '';
  note: string;
}

export interface WatchtowerPrep {
  paras: number | null;
  marked: number[];
  favs: { p: number | null; note: string }[];
}

export interface MidweekPrep {
  joias: string;
  joiasOk: boolean;
  faca: boolean;
  cbs: boolean;
}

export interface Assignment {
  week: DayKey;
  type: string;
}

export const ASSIGNMENT_TYPES = [
  'Leitura da Bíblia',
  'Iniciando conversas',
  'Cultivando o interesse',
  'Fazendo discípulos',
  'Explicando suas crenças',
  'Discurso',
  'Oração',
  'Outra',
];

export const SERVICE_KINDS = ['Casa em casa', 'Testemunho público', 'Informal', 'Cartas e telefone'];

export function weekRecord(repo: Repo, week: DayKey): WeekRecord | undefined {
  const w = repo.get<WeekRecord>(T.week, week);
  if (!w || !isBook(w.book) || w.from < 1 || w.to < w.from || w.to > chapterCount(w.book)) return undefined;
  return w;
}

/** Sugestão para a semana: continua de onde a semana anterior parou e repete a quantidade de capítulos. */
export function suggestWeek(repo: Repo, week: DayKey): WeekReading {
  const previous = repo
    .list<WeekRecord>(T.week)
    .filter((w) => w.key < week)
    .pop();
  if (previous) {
    const next = nextChapter(previous.data.book, previous.data.to);
    if (next) {
      const span = previous.data.to - previous.data.from;
      return { book: next.book, from: next.chapter, to: Math.min(chapterCount(next.book), next.chapter + span) };
    }
  }
  return { book: 1, from: 1, to: 2 };
}

export function readingEvents(repo: Repo, week: DayKey): ReadingEvent[] {
  return repo
    .list<ReadingEvent>(T.reading)
    .filter((r) => r.key.startsWith(`${week}:`))
    .map((r) => r.data);
}

export const readingKey = (week: DayKey, date: DayKey) => `${week}:${date}`;

export function sessions(repo: Repo): FieldSession[] {
  return repo.list<FieldSession>(T.session).map((s) => s.data);
}

export function students(repo: Repo): { key: string; data: Student }[] {
  return repo.list<Student>(T.student);
}

/** Uma noite de adoração em família registrada. */
export interface FamilyWorship {
  date: DayKey;
  format: string;
  note: string;
}

/** Ideias de formato, com palavras do app (o artigo completo abre no jw.org). */
export const FAMILY_FORMATS = [
  'Preparar juntos a próxima reunião',
  'Relato bíblico com desenho ou redação',
  'Estudar uma oração registrada na Bíblia',
  'Assistir a um vídeo do jw.org e conversar',
  'Treinar uma apresentação para o ministério',
  'Observar a criação e conversar sobre ela',
];

/** Link do jw.org salvo pela pessoa, com título e tema próprios. */
export interface SavedLink {
  url: string;
  title: string;
  theme: string;
  added: DayKey;
}

export function familyLog(repo: Repo): { key: string; data: FamilyWorship }[] {
  return repo.list<FamilyWorship>(T.family).sort((a, b) => (a.data.date < b.data.date ? 1 : a.data.date > b.data.date ? -1 : 0));
}

export function savedLinks(repo: Repo): { key: string; data: SavedLink }[] {
  return repo.list<SavedLink>(T.link).sort((a, b) => (a.data.added < b.data.added ? 1 : -1));
}

export function newId(): string {
  return crypto.randomUUID();
}
