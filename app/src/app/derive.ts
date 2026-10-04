import { addDays, dayWordDm, type DayKey } from '../domain/dates';
import { alexaWeekPhrase, nextWeekend, readingWindow, type ReadingWindow, type MeetingRef } from '../domain/meetings';
import { buildUnits, planWeek, type ReadingPlan, type Unit } from '../domain/reading';
import type { Repo } from '../data/repo';
import type { AudioStore } from './audioStore';
import { getSettings, readingEvents, T, weekRecord, type AppSettings, type MidweekPrep, type WatchtowerPrep, type WeekRecord } from './model';

export interface DayView {
  s: AppSettings;
  cur: DayKey;
  win: ReadingWindow;
  week: WeekRecord | undefined;
  units: Unit[] | null;
  plan: ReadingPlan | null;
  weekend: MeetingRef;
  wtPrep: WatchtowerPrep;
  midPrep: MidweekPrep;
  alexaPhrase: 'desta semana' | 'da semana que vem';
  /** Lições do "Ame as Pessoas" para focar no campo: da última reunião (ou da próxima, se ainda não houver). */
  focus: { lessons: number[]; when: string } | null;
}

const EMPTY_WT: WatchtowerPrep = { paras: null, marked: [], favs: [{ p: null, note: '' }, { p: null, note: '' }] };
const EMPTY_MID: MidweekPrep = { joias: '', joiasOk: false, faca: false, cbs: false };

/** Tudo o que as telas precisam calcular para o dia, num lugar só (sem tocar em rede). */
export function deriveDay(repo: Repo, audio: AudioStore, cur: DayKey): DayView {
  const s = getSettings(repo);
  const win = readingWindow(cur, s);
  const week = weekRecord(repo, win.meeting.week);
  const units = week ? buildUnits(week, (c) => audio.chapter(week.book, c)) : null;
  const plan =
    week && units
      ? planWeek({
          units,
          events: readingEvents(repo, win.meeting.week),
          start: win.start,
          end: win.end,
          meeting: win.meeting.date,
          cur,
          installDay: s.installDay,
          mode: s.splitMode,
        })
      : null;
  const weekend = nextWeekend(cur, s);
  const wtPrep = { ...EMPTY_WT, ...(repo.get<WatchtowerPrep>(T.watchtower, weekend.week) ?? {}) };
  if (!wtPrep.favs || wtPrep.favs.length < 2) wtPrep.favs = [...(wtPrep.favs ?? []), ...EMPTY_WT.favs].slice(0, 2);
  const midPrep = { ...EMPTY_MID, ...(repo.get<MidweekPrep>(T.midweek, win.meeting.week) ?? {}) };

  let focus: DayView['focus'] = null;
  const prev = weekRecord(repo, win.previous.week);
  if (prev?.lessons?.length) {
    focus = { lessons: prev.lessons, when: `treinadas na reunião de ${dayWordDm(win.previous.date)}` };
  } else if (week?.lessons?.length) {
    focus = {
      lessons: week.lessons,
      when: win.meeting.date === cur ? 'treinadas na reunião de hoje' : `que serão treinadas na reunião de ${dayWordDm(win.meeting.date)}`,
    };
  }

  return { s, cur, win, week, units, plan, weekend, wtPrep, midPrep, alexaPhrase: alexaWeekPhrase(win.meeting.week, cur), focus };
}

export function weekRangeLabel(week: DayKey): string {
  const end = addDays(week, 6);
  return `${week.slice(8, 10).replace(/^0/, '')}/${Number(week.slice(5, 7))} a ${end.slice(8, 10).replace(/^0/, '')}/${Number(end.slice(5, 7))}`;
}
