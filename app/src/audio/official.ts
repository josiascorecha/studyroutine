import type { ChapterAudio } from '../domain/reading';
import { parseStudyWeek, type StudyWeek } from '../domain/watchtower';

/**
 * Metadados do áudio oficial, do mesmo serviço que a página de download do jw.org usa.
 * Os Termos de Uso do jw.org permitem apps gratuitos e sem fins comerciais que baixam
 * MP3 das áreas públicas. O app não embute nenhum arquivo: baixa na hora, do servidor oficial.
 * O serviço não é uma API documentada: toda falha cai para "Abrir no jw.org" ou para a Alexa.
 */
const API = 'https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS';
const LANG = 'T';

interface ApiFile {
  title?: string;
  file?: { url?: string };
  duration?: number;
  track?: number;
  docid?: number;
  markers?: { markers?: { verseNumber?: number; startTime?: string | number }[] };
}

/** "00:00:02.469" → 2.469 */
export function parseTime(v: string | number | undefined): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const m = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(v ?? '');
  if (!m) return undefined;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function mp3s(data: unknown): ApiFile[] {
  const files = (data as { files?: Record<string, { MP3?: ApiFile[] }> })?.files;
  return files?.[LANG]?.MP3 ?? [];
}

export function parseChapterAudio(data: unknown): ChapterAudio | null {
  const f = mp3s(data)[0];
  const url = f?.file?.url;
  if (!f || !url || !/^https:\/\/[a-z0-9.-]+\.jw-cdn\.org\//.test(url) || !f.duration) return null;
  const starts: (number | undefined)[] = [];
  for (const m of f.markers?.markers ?? []) {
    const v = m.verseNumber;
    const t = parseTime(m.startTime);
    if (v && v > 0 && v < 200 && t !== undefined) starts[v - 1] = t;
  }
  return { url, duration: f.duration, starts };
}

export interface StudyArticleAudio extends StudyWeek {
  url: string;
  duration: number;
  docid: number | null;
}

export function parseStudyIssue(data: unknown, issue: string): StudyArticleAudio[] {
  const y = Number(issue.slice(0, 4));
  const m = Number(issue.slice(4, 6));
  const out: StudyArticleAudio[] = [];
  for (const f of mp3s(data)) {
    const week = f.title ? parseStudyWeek(f.title, y, m) : null;
    const url = f.file?.url;
    if (!week || !url || !f.duration) continue;
    out.push({ ...week, url, duration: f.duration, docid: f.docid && f.docid > 0 ? f.docid : null });
  }
  return out;
}

export const audioApi = {
  chapterUrl: (book: number, chapter: number) =>
    `${API}?output=json&pub=nwt&fileformat=MP3&alllangs=0&langwritten=${LANG}&txtCMSLang=${LANG}&booknum=${book}&track=${chapter}`,
  issueUrl: (issue: string) =>
    `${API}?output=json&pub=w&issue=${issue}&fileformat=MP3&alllangs=0&langwritten=${LANG}&txtCMSLang=${LANG}`,
};

export async function fetchJson(url: string, fetchImpl: typeof fetch = (...a) => fetch(...a), timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}
