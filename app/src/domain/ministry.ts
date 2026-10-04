import { daysBetween, fmtMinutes, keyToMs, lastDayOfMonth, MESES, type DayKey } from './dates';

export type MinistryMode = 'pub' | 'aux' | 'reg';

export interface FieldSession {
  date: DayKey;
  /** Minutos (0 para publicador, que não relata horas). */
  min: number;
  kind: string;
}

export interface Student {
  name: string;
  /** Lição atual do livro "Seja Feliz para Sempre!" (1 a 60). */
  lesson: number;
}

export const LFF_LESSONS = 60;

/** Partes do livro: 1 (1–12), 2 (13–33), 3 (34–47), 4 (48–60). */
export function lffPart(lesson: number): number {
  if (lesson <= 12) return 1;
  if (lesson <= 33) return 2;
  if (lesson <= 47) return 3;
  return 4;
}

/** Última lição de cada parte: depois dela vem a revisão da parte. */
export function isPartEnd(lesson: number): boolean {
  return lesson === 12 || lesson === 33 || lesson === 47 || lesson === 60;
}

export function monthSessions(sessions: FieldSession[], day: DayKey): FieldSession[] {
  const month = day.slice(0, 7);
  return sessions.filter((s) => s.date.slice(0, 7) === month);
}

/** Ano de serviço: 1º de setembro a 31 de agosto. */
export function serviceYear(day: DayKey): { start: DayKey; end: DayKey } {
  const [y, m] = day.split('-').map(Number);
  const startYear = m >= 9 ? y : y - 1;
  return { start: `${startYear}-09-01`, end: `${startYear + 1}-08-31` };
}

export interface Pace {
  /** Texto pronto para mostrar. */
  text: string;
  /** 0 a 100, para a barra de progresso. */
  percent: number;
  hoursLabel: string;
}

/** Ritmo do pioneiro. A meta é sempre a que a própria pessoa informou (o app não fixa números). */
export function pioneerPace(mode: MinistryMode, meta: number | null, sessions: FieldSession[], day: DayKey): Pace | null {
  if (mode === 'pub') return null;
  const monthMin = monthSessions(sessions, day).reduce((a, s) => a + s.min, 0);
  if (mode === 'aux') {
    if (!meta) return { text: 'Informe a sua meta em Ajustes para ver o ritmo.', percent: 0, hoursLabel: fmtMinutes(monthMin) };
    const remainMin = Math.max(0, meta * 60 - monthMin);
    const end = lastDayOfMonth(day);
    const daysLeft = daysBetween(day, end) + 1;
    const perWeek = remainMin / Math.max(1, daysLeft / 7);
    const [, mm, dd] = end.split('-');
    const text = remainMin <= 0 ? 'Meta do mês alcançada.' : `Faltam ${fmtMinutes(remainMin)} até ${Number(dd)}/${Number(mm)}, cerca de ${fmtMinutes(perWeek)} por semana.`;
    return { text, percent: Math.min(100, (monthMin / (meta * 60)) * 100), hoursLabel: fmtMinutes(monthMin) };
  }
  const sy = serviceYear(day);
  const yearMin = sessions.filter((s) => s.date >= sy.start && s.date <= sy.end).reduce((a, s) => a + s.min, 0);
  if (!meta) return { text: 'Informe a sua meta em Ajustes para ver o ritmo.', percent: 0, hoursLabel: fmtMinutes(yearMin) };
  const totalDays = daysBetween(sy.start, sy.end) + 1;
  const elapsed = daysBetween(sy.start, day) + 1;
  const idealMin = (meta * 60 * elapsed) / totalDays;
  const diff = yearMin - idealMin;
  const status = diff >= 0 ? `Você está ${fmtMinutes(diff)} à frente.` : `Faltam ${fmtMinutes(-diff)} para ficar em dia.`;
  return {
    text: `Ritmo ideal até hoje: ${fmtMinutes(idealMin)}. ${status} Neste mês: ${fmtMinutes(monthMin)}.`,
    percent: Math.min(100, (yearMin / (meta * 60)) * 100),
    hoursLabel: fmtMinutes(yearMin),
  };
}

/** Texto do relatório do mês, no formato atual: participação e estudos; horas só para pioneiros. */
export function reportText(mode: MinistryMode, sessions: FieldSession[], studies: number, day: DayKey): string {
  const d = new Date(keyToMs(day));
  const ms = monthSessions(sessions, day);
  const lines = [
    `Relatório de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`,
    `Participei no ministério: ${ms.length ? 'sim' : 'não'}`,
    `Estudos bíblicos: ${studies}`,
  ];
  if (mode !== 'pub') lines.push(`Horas: ${fmtMinutes(ms.reduce((a, s) => a + s.min, 0))}`);
  return lines.join('\n');
}
