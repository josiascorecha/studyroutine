import { describe, expect, it } from 'vitest';
import { parseWorkbookIssue } from '../src/audio/official';
import { AudioStore } from '../src/app/audioStore';
import { assignmentWhen, defaultSettings, upcomingMeetings } from '../src/app/model';
import { Repo } from '../src/data/repo';
import { bookNumber, parseWorkbookWeek, workbookIssues } from '../src/domain/workbook';

const rtf = (titles: string[]) => ({ files: { T: { RTF: [{ title: '<strong>Baixar todos os arquivos (ZIP)</strong>' }, ...titles.map((title) => ({ title }))] } } });

describe('leitura da semana pela apostila oficial', () => {
  it('lê semana e trecho dos títulos dos arquivos', () => {
    expect(parseWorkbookWeek('5 a 11 de outubro (Jeremias 40 a 41)', 2026, 9)).toEqual({ start: '2026-10-05', book: 24, from: 40, to: 41 });
    expect(parseWorkbookWeek('26 de outubro a 1.º de novembro (Jeremias 47 a 48)', 2026, 9)).toEqual({ start: '2026-10-26', book: 24, from: 47, to: 48 });
    expect(parseWorkbookWeek('28 de dezembro a 3 de janeiro (Ezequiel 9 a 10)', 2026, 11)).toEqual({ start: '2026-12-28', book: 26, from: 9, to: 10 });
    expect(parseWorkbookWeek('7 a 13 de julho (Provérbios 21)', 2025, 7)).toEqual({ start: '2025-07-07', book: 20, from: 21, to: 21 });
    expect(parseWorkbookWeek('16 a 22 de novembro (Lamentações 1 a 2)', 2026, 11)?.book).toBe(25);
  });

  it('recusa o que não entende', () => {
    expect(parseWorkbookWeek('<strong>Baixar todos os arquivos (ZIP)</strong>', 2026, 9)).toBeNull();
    expect(parseWorkbookWeek('5 a 12 de outubro (Jeremias 40 a 41)', 2026, 9)).toBeNull(); // não fecha 7 dias
    expect(parseWorkbookWeek('5 a 11 de outubro (Livro Inexistente 1)', 2026, 9)).toBeNull();
    expect(parseWorkbookWeek('5 a 11 de outubro (Jeremias 52 a 53)', 2026, 9)).toBeNull(); // Jeremias tem 52
    expect(bookNumber('cantico de salomao')).toBe(22);
    expect(bookNumber('1 Samuel')).toBe(9);
  });

  it('escolhe a edição bimestral provável e a anterior', () => {
    expect(workbookIssues('2026-10-12')).toEqual(['202609', '202607']);
    expect(workbookIssues('2026-11-30')).toEqual(['202611', '202609']);
    expect(workbookIssues('2027-01-04')).toEqual(['202701', '202611']);
    expect(workbookIssues('2026-02-23')).toEqual(['202601', '202511']);
  });

  it('busca, guarda em cache e serve a semana sem rede depois', async () => {
    const repo = await Repo.open(`mwb-${Math.random()}`);
    const urls: string[] = [];
    const ok = ((u: string) => {
      urls.push(u);
      return Promise.resolve(new Response(JSON.stringify(rtf(['5 a 11 de outubro (Jeremias 40 a 41)', '12 a 18 de outubro (Jeremias 42 a 44)']))));
    }) as unknown as typeof fetch;
    const store = new AudioStore(repo, ok);
    await store.ensureProgram('2026-10-12');
    expect(store.program('2026-10-12')).toEqual({ start: '2026-10-12', book: 24, from: 42, to: 44 });
    expect(urls[0]).toContain('pub=mwb&issue=202609&fileformat=RTF');

    const off = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    const again = new AudioStore(repo, off);
    await again.ensureProgram('2026-10-12');
    expect(again.program('2026-10-12')?.from).toBe(42);
    await again.ensureProgram('2026-10-19');
    expect(again.program('2026-10-19')).toBeUndefined();
  });

  it('ignora o arquivo "baixar todos" e títulos repetidos', () => {
    expect(parseWorkbookIssue(rtf(['5 a 11 de outubro (Jeremias 40 a 41)', '5 a 11 de outubro (Jeremias 40 a 41)']), '202609')).toHaveLength(1);
  });
});

describe('designações com data', () => {
  const s = { ...defaultSettings('2026-10-01'), midDay: 3, wkDay: 0 };

  it('lista as próximas reuniões das duas, em ordem, a partir de hoje', () => {
    const list = upcomingMeetings('2026-10-15', s, 2);
    expect(list.slice(0, 4)).toEqual([
      { date: '2026-10-18', kind: 'fim', week: '2026-10-12' },
      { date: '2026-10-21', kind: 'meio', week: '2026-10-19' },
      { date: '2026-10-25', kind: 'fim', week: '2026-10-19' },
      { date: '2026-10-28', kind: 'meio', week: '2026-10-26' },
    ]);
    expect(upcomingMeetings('2026-10-14', s, 1)[0]).toEqual({ date: '2026-10-14', kind: 'meio', week: '2026-10-12' });
  });

  it('respeita a semana excepcional e lê o formato antigo', () => {
    const ex = { ...s, exceptions: { '2026-10-19': 5 } };
    expect(upcomingMeetings('2026-10-19', ex, 1)[0]).toEqual({ date: '2026-10-23', kind: 'meio', week: '2026-10-19' });
    expect(assignmentWhen({ week: '2026-10-19', type: 'Leitura da Bíblia' }, s)).toEqual({ date: '2026-10-21', kind: 'meio' });
    expect(assignmentWhen({ date: '2026-10-25', kind: 'fim', type: 'Oração' }, s)).toEqual({ date: '2026-10-25', kind: 'fim' });
  });
});
