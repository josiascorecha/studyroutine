import { audioApi, fetchJson, parseChapterAudio, parseStudyIssue, type StudyArticleAudio } from '../audio/official';
import type { DayKey } from '../domain/dates';
import type { ChapterAudio } from '../domain/reading';
import { candidateIssues } from '../domain/watchtower';
import type { Repo } from '../data/repo';

type Listener = () => void;

/**
 * Guarda os metadados do áudio oficial (URL, duração, marcadores) no cache local do aparelho.
 * Não é dado da pessoa: não sincroniza. Baixa só quando precisa e tolera ficar sem rede.
 */
export class AudioStore {
  private chapters = new Map<string, ChapterAudio | null>();
  private articles = new Map<DayKey, StudyArticleAudio | null>();
  private inflight = new Map<string, Promise<void>>();
  private listeners = new Set<Listener>();
  version = 0;

  constructor(
    private repo: Repo,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.version += 1;
    for (const fn of this.listeners) fn();
  }

  chapter(book: number, chapter: number): ChapterAudio | undefined {
    return this.chapters.get(`${book}:${chapter}`) ?? undefined;
  }

  article(week: DayKey): StudyArticleAudio | undefined {
    return this.articles.get(week) ?? undefined;
  }

  private once(key: string, fn: () => Promise<void>): Promise<void> {
    const cur = this.inflight.get(key);
    if (cur) return cur;
    const p = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  async ensureChapters(book: number, from: number, to: number): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (let c = from; c <= to; c++) {
      const key = `${book}:${c}`;
      if (this.chapters.has(key)) continue;
      jobs.push(
        this.once(`c:${key}`, async () => {
          const cacheKey = `audio:nwt:T:${key}`;
          let audio = (await this.repo.getCache<ChapterAudio>(cacheKey)) ?? null;
          if (!audio) {
            try {
              audio = parseChapterAudio(await fetchJson(audioApi.chapterUrl(book, c), this.fetchImpl));
              if (audio) await this.repo.setCache(cacheKey, audio);
            } catch {
              audio = null; // sem rede ou serviço indisponível: o app segue sem áudio
            }
          }
          if (audio) {
            this.chapters.set(key, audio);
            this.notify();
          }
        }),
      );
    }
    await Promise.all(jobs);
  }

  async ensureArticle(week: DayKey): Promise<void> {
    if (this.articles.has(week)) return;
    await this.once(`w:${week}`, async () => {
      const cached = await this.repo.getCache<StudyArticleAudio>(`wt:week:${week}`);
      if (cached) {
        this.articles.set(week, cached);
        this.notify();
        return;
      }
      for (const issue of candidateIssues(week)) {
        let list = await this.repo.getCache<StudyArticleAudio[]>(`wt:issue:${issue}`);
        if (!list) {
          try {
            list = parseStudyIssue(await fetchJson(audioApi.issueUrl(issue), this.fetchImpl), issue);
            await this.repo.setCache(`wt:issue:${issue}`, list);
          } catch {
            continue;
          }
        }
        const found = list.find((a) => a.start === week);
        if (found) {
          await this.repo.setCache(`wt:week:${week}`, found);
          this.articles.set(week, found);
          this.notify();
          return;
        }
      }
    });
  }
}
