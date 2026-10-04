import { addDays, monday, type DayKey } from './dates';

export interface MeetingSettings {
  /** Dia da reunião de meio de semana: 1 = segunda … 5 = sexta. */
  midDay: number;
  midTime: string;
  /** Reunião de fim de semana: 6 = sábado, 0 = domingo. */
  wkDay: number;
  wkTime: string;
  /** Terminar a leitura na véspera ou no próprio dia da reunião. */
  deadline: 'vespera' | 'dia';
  /** Semana (segunda-feira) → dia excepcional da reunião (ex.: visita do superintendente). */
  exceptions: Record<DayKey, number>;
}

export interface MeetingRef {
  date: DayKey;
  /** Segunda-feira da semana da programação. */
  week: DayKey;
}

export function midweekOf(week: DayKey, s: MeetingSettings): DayKey {
  const d = s.exceptions[week] ?? s.midDay;
  return addDays(week, d - 1);
}

/** Próxima reunião de meio de semana (hoje conta, se for o dia). */
export function nextMidweek(cur: DayKey, s: MeetingSettings): MeetingRef {
  let week = monday(cur);
  let date = midweekOf(week, s);
  if (date < cur) {
    week = addDays(week, 7);
    date = midweekOf(week, s);
  }
  return { date, week };
}

export function weekendOf(week: DayKey, s: MeetingSettings): DayKey {
  return addDays(week, s.wkDay === 6 ? 5 : 6);
}

export function nextWeekend(cur: DayKey, s: MeetingSettings): MeetingRef {
  let week = monday(cur);
  let date = weekendOf(week, s);
  if (date < cur) {
    week = addDays(week, 7);
    date = weekendOf(week, s);
  }
  return { date, week };
}

export interface ReadingWindow {
  meeting: MeetingRef;
  previous: MeetingRef;
  /** Primeiro e último dia de leitura (inclusive). */
  start: DayKey;
  end: DayKey;
}

/** A leitura da semana vai do dia seguinte à última reunião até a véspera (ou o dia) da próxima. */
export function readingWindow(cur: DayKey, s: MeetingSettings): ReadingWindow {
  const meeting = nextMidweek(cur, s);
  const prevWeek = addDays(meeting.week, -7);
  const previous = { week: prevWeek, date: midweekOf(prevWeek, s) };
  const start = addDays(previous.date, 1);
  const end = s.deadline === 'dia' ? meeting.date : addDays(meeting.date, -1);
  return { meeting, previous, start, end };
}

/** Para a Alexa a semana começa na segunda: "desta semana" ou "da semana que vem". */
export function alexaWeekPhrase(meetingWeek: DayKey, cur: DayKey): 'desta semana' | 'da semana que vem' {
  return meetingWeek === monday(cur) ? 'desta semana' : 'da semana que vem';
}
