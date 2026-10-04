import { bookName } from '../domain/bible';
import { portionLabel, portionRefs, portionSegments, type ReadVia } from '../domain/reading';
import type { Services } from './context';
import type { DayView } from './derive';
import { readingKey, T, type DailyTextRecord, type WatchtowerPrep } from './model';

/** Ações das telas: cada uma grava um registro local (que depois sincroniza, se ativado). */
export function actions(svc: Services, view: DayView) {
  const { repo, audio, player } = svc;
  const cur = view.cur;

  const dailyText = (): DailyTextRecord => repo.get<DailyTextRecord>(T.dailyText, cur) ?? { done: false, via: '', note: '' };

  return {
    dailyText,
    async setDailyText(done: boolean, via: ReadVia | '' = 'leitura') {
      await repo.put<DailyTextRecord>(T.dailyText, cur, { ...dailyText(), done, via: done ? via : '' });
    },
    async setDailyNote(note: string) {
      await repo.put<DailyTextRecord>(T.dailyText, cur, { ...dailyText(), note });
    },

    /** Marca a porção de hoje como feita, ou desfaz se já estava. */
    async toggleReading(via: ReadVia = 'leitura') {
      const p = view.plan;
      if (!p) return;
      const key = readingKey(view.win.meeting.week, cur);
      if (p.todayDone) {
        await repo.remove(T.reading, key);
        return;
      }
      if (!p.todayRange) return;
      const refs = portionRefs(p.units, p.todayRange[0], p.todayRange[1]);
      await repo.put(T.reading, key, { date: cur, from: refs.from, to: refs.to, via });
    },

    /** Toca exatamente a porção de hoje no áudio oficial (precisa dos metadados do capítulo). */
    async playToday(): Promise<boolean> {
      const p = view.plan;
      const w = view.week;
      if (!p || !w) return false;
      const r = p.todayRange ?? (p.todayDone ? ([p.todayDone.from!, p.todayDone.to!] as [number, number]) : null);
      if (!r) return false;
      await audio.ensureChapters(w.book, w.from, w.to);
      const segs = portionSegments(p.units, r[0], r[1], (c) => audio.chapter(w.book, c));
      if (!segs) return false;
      await player.play(`Leitura de hoje · ${portionLabel(w.book, p.units, r[0], r[1])}`, segs);
      return true;
    },

    async playWatchtower(): Promise<boolean> {
      await audio.ensureArticle(view.weekend.week);
      const a = audio.article(view.weekend.week);
      if (!a) return false;
      await player.play(`A Sentinela · ${a.title}`, [{ chapter: 0, url: a.url, start: 0, end: a.duration }]);
      return true;
    },

    async updateWatchtower(patch: Partial<WatchtowerPrep>) {
      await repo.put<WatchtowerPrep>(T.watchtower, view.weekend.week, { ...view.wtPrep, ...patch });
    },

    bookLabel: () => (view.week ? bookName(view.week.book) : ''),
  };
}
