import type { AppSettings } from '../app/model';
import { DIAS } from '../domain/dates';

/**
 * Quais lembretes semanais agendar, a partir dos ajustes. Puro (sem Capacitor), para testar.
 * Os textos são genéricos: o conteúdo de cada dia é aberto no app ou nas fontes oficiais.
 */
export interface PlannedReminder {
  id: number;
  title: string;
  body: string;
  /** Dia da semana (0 = domingo … 6 = sábado); ausente = todo dia. */
  weekday?: number;
  hour: number;
  minute: number;
  /** Aba que o toque na notificação abre. */
  tab: 'hoje' | 'leitura' | 'reunioes' | 'estudo';
  meeting?: 'meio' | 'fim';
}

export const REMINDER_IDS = {
  dailyText: 101,
  reading: 102,
  midweek: 103,
  weekend: 104,
  family: 105,
  /** 110 + dia da semana. */
  study: 110,
};

/** Todos os ids que o app pode ter agendado (para cancelar antes de reagendar). */
export const ALL_REMINDER_IDS = [101, 102, 103, 104, 105, 110, 111, 112, 113, 114, 115, 116];

export function hm(t: string): { hour: number; minute: number } {
  const [h, m] = (t || '').split(':').map(Number);
  return { hour: Number.isFinite(h) ? h : 0, minute: Number.isFinite(m) ? m : 0 };
}

const wd = (d: number) => ((d % 7) + 7) % 7;

/** "amanhã", "depois de amanhã" ou "na quarta-feira". */
export function whenWord(before: number, meetingDay: number): string {
  if (before === 1) return 'amanhã';
  if (before === 2) return 'depois de amanhã';
  const name = DIAS[wd(meetingDay)];
  return `${/^(s[aá]bado|domingo)$/.test(name) ? 'no' : 'na'} ${name}`;
}

export function reminderPlan(s: AppSettings): PlannedReminder[] {
  if (!s.reminders) return [];
  const r = s.remind;
  const out: PlannedReminder[] = [];
  if (r.dt) out.push({ id: REMINDER_IDS.dailyText, title: 'Texto diário', body: 'Hora do texto de hoje.', ...hm(s.dtTime), tab: 'hoje' });
  if (r.read) out.push({ id: REMINDER_IDS.reading, title: 'Leitura da Bíblia', body: 'Sua porção de hoje está pronta.', ...hm(s.readTime), tab: 'leitura' });
  if (r.study) {
    for (const d of [...new Set(s.studyDays)].filter((x) => x >= 0 && x <= 6).sort()) {
      out.push({ id: REMINDER_IDS.study + d, title: 'Estudo pessoal', body: 'Hora do seu estudo pessoal.', weekday: d, ...hm(s.studyTime), tab: 'estudo' });
    }
  }
  if (r.family && s.familyDay !== null) {
    out.push({
      id: REMINDER_IDS.family,
      title: 'Adoração em família',
      body: 'Hoje é dia da adoração em família. Há uma ideia pronta no app.',
      weekday: s.familyDay,
      ...hm(s.familyTime),
      tab: 'estudo',
    });
  }
  if (r.mid) {
    out.push({
      id: REMINDER_IDS.midweek,
      title: 'Preparar a reunião',
      body: `Reunião de meio de semana ${whenWord(s.midPrep.before, s.midDay)}: veja a apostila, as joias e suas partes.`,
      weekday: wd(s.midDay - s.midPrep.before),
      ...hm(s.midPrep.time),
      tab: 'reunioes',
      meeting: 'meio',
    });
  }
  if (r.wk) {
    out.push({
      id: REMINDER_IDS.weekend,
      title: 'Preparar A Sentinela',
      body: `Reunião de fim de semana ${whenWord(s.wkPrep.before, s.wkDay)}: marque os parágrafos e prepare um comentário.`,
      weekday: wd(s.wkDay - s.wkPrep.before),
      ...hm(s.wkPrep.time),
      tab: 'reunioes',
      meeting: 'fim',
    });
  }
  return out;
}
