import { describe, expect, it } from 'vitest';
import {
  buildUnits,
  filledStarts,
  planWeek,
  portionLabel,
  portionRefs,
  portionSeconds,
  portionSegments,
  type ReadingEvent,
  type SplitMode,
} from '../src/domain/reading';
import { jerAudio } from './fixtures';

const week = { book: 24, from: 40, to: 41 };
const unitsAudio = buildUnits(week, jerAudio);
const unitsNoAudio = buildUnits(week, () => undefined);

function plan(cur: string, events: ReadingEvent[] = [], mode: SplitMode = 'versos', install = '2026-10-02') {
  return planWeek({ units: unitsAudio, events, start: '2026-10-01', end: '2026-10-06', meeting: '2026-10-07', cur, installDay: install, mode });
}

function event(cur: string, from: number, to: number, via: ReadingEvent['via'] = 'leitura'): ReadingEvent {
  const r = portionRefs(unitsAudio, from, to);
  return { date: cur, from: r.from, to: r.to, via };
}

describe('unidades e áudio', () => {
  it('usa a contagem de versículos e as durações do áudio oficial', () => {
    expect(unitsAudio).toHaveLength(34);
    expect(unitsNoAudio).toHaveLength(34);
    expect(unitsNoAudio[0].dur).toBeNull();
    expect(portionSeconds(unitsAudio, 0, 16)).toBeCloseTo(245.616, 3);
  });

  it('completa marcador ausente (Jer 39 não tem o v. 12)', () => {
    const s = filledStarts(jerAudio(39)!, 18);
    expect(s[11]).toBeGreaterThan(118.675);
    expect(s[11]).toBeLessThan(133.506);
  });

  it('gera trechos que tocam exatamente a porção, inclusive entre capítulos', () => {
    const segs = portionSegments(unitsAudio, 14, 21, jerAudio)!;
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ chapter: 40, start: 209.459, end: 245.616 });
    expect(segs[1]).toMatchObject({ chapter: 41, start: 0, end: 62.927 });
    expect(portionSegments(unitsAudio, 0, 5, () => undefined)).toBeNull();
  });

  it('rótulos', () => {
    expect(portionLabel(24, unitsAudio, 0, 7)).toBe('Jeremias 40:1–7');
    expect(portionLabel(24, unitsAudio, 14, 21)).toBe('Jeremias 40:15–41:5');
    expect(portionLabel(24, unitsAudio, 0, 34)).toBe('Jeremias 40–41');
    expect(portionLabel(24, unitsAudio, 16, 34)).toBe('Jeremias 41');
  });
});

describe('plano da semana', () => {
  it('quem começa na sexta não fica "atrasado" pela quinta', () => {
    const p = plan('2026-10-02');
    expect(p.rows.map((r) => r.status)).toEqual(['antes', 'hoje', 'planejado', 'planejado', 'planejado', 'planejado']);
    expect(portionLabel(24, unitsAudio, ...p.todayRange!)).toBe('Jeremias 40:1–7');
    expect(p.missed).toBe(false);
  });

  it('modo capítulos espalha os capítulos e deixa folgas', () => {
    const p = plan('2026-10-02', [], 'capitulos');
    const labels = p.rows.map((r) => (r.from !== undefined ? portionLabel(24, unitsAudio, r.from, r.to!) : r.status));
    expect(labels).toEqual(['antes', 'Jeremias 40', 'folga', 'Jeremias 41', 'folga', 'folga']);
  });

  it('modo minutos equilibra pela duração do áudio', () => {
    const p = plan('2026-10-02', [], 'minutos');
    const secs = p.rows.filter((r) => r.from !== undefined).map((r) => portionSeconds(unitsAudio, r.from!, r.to!)!);
    expect(Math.max(...secs) - Math.min(...secs)).toBeLessThan(60);
  });

  it('sem áudio baixado, "minutos" cai para versículos', () => {
    const p = planWeek({ units: unitsNoAudio, events: [], start: '2026-10-01', end: '2026-10-06', meeting: '2026-10-07', cur: '2026-10-02', installDay: '2026-10-02', mode: 'minutos' });
    expect(p.todayRange).toEqual([0, 7]);
  });

  it('marcar hoje e depois pular um dia redistribui o restante', () => {
    const e1 = event('2026-10-02', 0, 7);
    const sexta = plan('2026-10-02', [e1]);
    expect(sexta.todayDone?.status).toBe('lido');
    expect(sexta.nextRow && portionLabel(24, unitsAudio, sexta.nextRow.from!, sexta.nextRow.to!)).toBe('Jeremias 40:8–14');

    const domingo = plan('2026-10-04', [e1]);
    expect(domingo.missed).toBe(true);
    expect(domingo.rows.map((r) => r.status)).toEqual(['antes', 'lido', 'perdido', 'hoje', 'planejado', 'planejado']);
    // 27 versículos restantes em 3 dias: 9 por dia.
    expect(domingo.todayRange).toEqual([7, 16]);
  });

  it('no dia da reunião, o que faltou vai todo para hoje', () => {
    const p = planWeek({ units: unitsAudio, events: [], start: '2026-10-01', end: '2026-10-06', meeting: '2026-10-07', cur: '2026-10-07', installDay: '2026-10-01', mode: 'versos' });
    expect(p.catchUp).toBe(true);
    expect(p.todayRange).toEqual([0, 34]);
  });

  it('semana concluída', () => {
    const p = plan('2026-10-03', [event('2026-10-02', 0, 20), event('2026-10-03', 20, 34)]);
    expect(p.progress).toBe(34);
    expect(p.todayRange).toBeNull();
    expect(p.missed).toBe(false);
  });

  it('eventos de outro trecho (semana corrigida) são ignorados', () => {
    const p = plan('2026-10-02', [{ date: '2026-10-01', from: { c: 38, v: 1 }, to: { c: 38, v: 10 }, via: 'leitura' }]);
    expect(p.progress).toBe(0);
  });
});
