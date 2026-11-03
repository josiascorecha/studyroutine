import { describe, expect, it } from 'vitest';
import { defaultSettings, type AppSettings } from '../src/app/model';
import { reminderPlan, whenWord } from '../src/notify/plan';

const base = (patch: Partial<AppSettings> = {}): AppSettings => ({ ...defaultSettings('2026-11-03'), onboarded: true, ...patch });

describe('lembretes', () => {
  it('padrão: texto, leitura e preparo das duas reuniões na véspera', () => {
    const p = reminderPlan(base());
    expect(p.map((r) => r.title)).toEqual(['Texto diário', 'Leitura da Bíblia', 'Preparar a reunião', 'Preparar A Sentinela']);
    const mid = p.find((r) => r.meeting === 'meio')!;
    expect(mid.weekday).toBe(2); // reunião na quarta → lembrete na terça
    expect(mid.body).toMatch(/amanhã/);
    const wk = p.find((r) => r.meeting === 'fim')!;
    expect(wk.weekday).toBe(6); // reunião no domingo → sábado
    const dt = p.find((r) => r.title === 'Texto diário')!;
    expect(dt).toMatchObject({ hour: 6, minute: 30 });
    expect(dt.weekday).toBeUndefined();
  });

  it('estudo pessoal em vários dias e adoração em família no dia escolhido', () => {
    const p = reminderPlan(base({ studyDays: [5, 1, 1], studyTime: '21:15', familyDay: 4, familyTime: '20:00' }));
    const study = p.filter((r) => r.title === 'Estudo pessoal');
    expect(study.map((r) => [r.id, r.weekday, r.hour, r.minute])).toEqual([
      [111, 1, 21, 15],
      [115, 5, 21, 15],
    ]);
    expect(p.find((r) => r.title === 'Adoração em família')).toMatchObject({ weekday: 4, hour: 20, minute: 0, tab: 'estudo' });
  });

  it('preparo com antecedência e cada lembrete pode ser desligado', () => {
    const p = reminderPlan(base({ midDay: 2, midPrep: { before: 3, time: '18:30' }, remind: { dt: false, read: true, study: true, family: true, mid: true, wk: false } }));
    expect(p.map((r) => r.title)).toEqual(['Leitura da Bíblia', 'Preparar a reunião']);
    expect(p[1]).toMatchObject({ weekday: 6, hour: 18, minute: 30 }); // terça − 3 = sábado
    expect(p[1].body).toMatch(/na terça-feira/);
    expect(whenWord(4, 0)).toBe('no domingo');
    expect(whenWord(2, 3)).toBe('depois de amanhã');
  });

  it('chave geral desligada: nada', () => {
    expect(reminderPlan(base({ reminders: false, studyDays: [1] }))).toEqual([]);
  });
});
