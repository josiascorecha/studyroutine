import { describe, expect, it } from 'vitest';
import { alexa } from '../src/domain/alexa';
import { BOOK_NAMES, chapterCount, nextChapter, TOTAL_CHAPTERS, verseCount } from '../src/domain/bible';
import { addDays, fmtMinutes, fmtTime, isDayKey, longDay, monday, shortDay } from '../src/domain/dates';
import { bibleCode, isOfficialUrl, links } from '../src/domain/links';
import { alexaWeekPhrase, nextWeekend, readingWindow, type MeetingSettings } from '../src/domain/meetings';
import { isPartEnd, lffPart, pioneerPace, reportText } from '../src/domain/ministry';
import { candidateIssues, parseStudyWeek } from '../src/domain/watchtower';
import { VERSE_COUNTS } from '../src/domain/versification';

const base: MeetingSettings = { midDay: 3, midTime: '19:30', wkDay: 0, wkTime: '09:00', deadline: 'vespera', exceptions: {} };

describe('datas', () => {
  it('formata e calcula semanas de segunda a domingo', () => {
    expect(monday('2026-10-04')).toBe('2026-09-28');
    expect(monday('2026-10-05')).toBe('2026-10-05');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(shortDay('2026-10-01')).toBe('qui, 1/10');
    expect(longDay('2026-10-02')).toBe('Sexta-feira, 2 de outubro');
    expect(fmtTime('19:30')).toBe('19h30');
    expect(fmtTime('09:00')).toBe('9h');
    expect(fmtMinutes(90)).toBe('1h30');
    expect(fmtMinutes(45)).toBe('45 min');
    expect(isDayKey('2026-02-30')).toBe(false);
  });
});

describe('Bíblia', () => {
  it('tem 66 livros e 1.189 capítulos', () => {
    expect(BOOK_NAMES).toHaveLength(66);
    expect(VERSE_COUNTS.reduce((a, b) => a + b.length, 0)).toBe(TOTAL_CHAPTERS);
    expect(chapterCount(24)).toBe(52);
    expect(verseCount(24, 40)).toBe(16);
    expect(verseCount(64, 1)).toBe(14);
    expect(nextChapter(24, 52)).toEqual({ book: 25, chapter: 1 });
    expect(nextChapter(66, 22)).toBeNull();
  });
});

describe('links oficiais', () => {
  it('monta os formatos conferidos no jw.org', () => {
    expect(links.dailyText('2026-10-02')).toBe('https://www.jw.org/finder?wtlocale=T&alias=daily-text&date=20261002');
    expect(links.meetings('2026-10-05')).toBe('https://www.jw.org/finder?wtlocale=T&alias=meetings&date=20261005');
    expect(bibleCode(24, 40, 1)).toBe('24040001');
    expect(links.bible(24, 40, 1, 40, 16)).toContain('bible=24040001-24040016');
    expect(links.wolChapter(24, 40)).toBe('https://wol.jw.org/pt/wol/b/r5/lp-t/nwtsty/24/40');
    expect(isOfficialUrl('https://wol.jw.org/pt/')).toBe(true);
    expect(isOfficialUrl('https://jw.org.golpe.com/')).toBe(false);
  });
});

describe('reuniões e janela de leitura', () => {
  it('com reunião na quarta, a leitura vai de quinta a terça', () => {
    const w = readingWindow('2026-10-02', base);
    expect(w.meeting).toEqual({ date: '2026-10-07', week: '2026-10-05' });
    expect(w.start).toBe('2026-10-01');
    expect(w.end).toBe('2026-10-06');
  });

  it('no dia da reunião, ela ainda é a próxima', () => {
    const w = readingWindow('2026-10-02', { ...base, midDay: 5 });
    expect(w.meeting.date).toBe('2026-10-02');
    expect(w.end).toBe('2026-10-01');
  });

  it('prazo "no dia" inclui o dia da reunião', () => {
    expect(readingWindow('2026-10-02', { ...base, deadline: 'dia' }).end).toBe('2026-10-07');
  });

  it('semana especial muda só aquela semana', () => {
    const s = { ...base, exceptions: { '2026-10-05': 2 } };
    const w = readingWindow('2026-10-02', s);
    expect(w.meeting.date).toBe('2026-10-06');
    expect(w.end).toBe('2026-10-05');
    expect(readingWindow('2026-10-08', s).meeting.date).toBe('2026-10-14');
  });

  it('fim de semana e frase da Alexa', () => {
    expect(nextWeekend('2026-10-02', base).date).toBe('2026-10-04');
    expect(nextWeekend('2026-10-02', { ...base, wkDay: 6 }).date).toBe('2026-10-03');
    expect(alexaWeekPhrase('2026-10-05', '2026-10-02')).toBe('da semana que vem');
    expect(alexaWeekPhrase('2026-10-05', '2026-10-05')).toBe('desta semana');
    expect(alexa.weekReading('desta semana')).toBe('Alexa, ler a leitura da Bíblia desta semana do jw.org');
  });
});

describe('A Sentinela: semana de estudo no título do áudio', () => {
  it('lê os formatos com um e com dois meses', () => {
    expect(parseStudyWeek('Ajude outros a conhecer a Jeová (28 de setembro—4 de outubro)', 2026, 7)).toEqual({
      start: '2026-09-28',
      end: '2026-10-04',
      title: 'Ajude outros a conhecer a Jeová',
    });
    const w = parseStudyWeek('Você pode vencer a luta contra Satanás e os demônios  (12-18 de outubro)', 2026, 8);
    expect(w?.start).toBe('2026-10-12');
    expect(w?.title).toBe('Você pode vencer a luta contra Satanás e os demônios');
  });

  it('vira o ano corretamente', () => {
    expect(parseStudyWeek('Tire tempo para o texto diário (28 de dezembro–3 de janeiro)', 2026, 10)).toMatchObject({
      start: '2026-12-28',
      end: '2027-01-03',
    });
    expect(parseStudyWeek('Artigo (4-10 de janeiro)', 2026, 11)?.start).toBe('2027-01-04');
  });

  it('ignora títulos sem semana ou com semana inconsistente', () => {
    expect(parseStudyWeek('Você Sabia?', 2026, 8)).toBeNull();
    expect(parseStudyWeek('Artigo (5-12 de outubro)', 2026, 8)).toBeNull();
  });

  it('procura nas edições de 2 e 3 meses antes', () => {
    expect(candidateIssues('2026-10-05')).toEqual(['202608', '202607', '202609']);
    expect(candidateIssues('2027-01-04')).toEqual(['202611', '202610', '202612']);
  });
});

describe('ministério', () => {
  it('partes e revisões do Seja Feliz para Sempre!', () => {
    expect([1, 12, 13, 33, 34, 47, 48, 60].map(lffPart)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(isPartEnd(12)).toBe(true);
    expect(isPartEnd(13)).toBe(false);
  });

  it('ritmo do pioneiro auxiliar e regular usa a meta informada', () => {
    const s = [{ date: '2026-10-02', min: 90, kind: 'Casa em casa' }];
    expect(pioneerPace('pub', 30, s, '2026-10-02')).toBeNull();
    expect(pioneerPace('aux', null, s, '2026-10-02')?.text).toContain('Informe a sua meta');
    const aux = pioneerPace('aux', 30, s, '2026-10-02')!;
    expect(aux.text).toContain('Faltam 28h30 até 31/10');
    expect(aux.percent).toBeCloseTo(5, 0);
    const reg = pioneerPace('reg', 600, s, '2026-10-02')!;
    expect(reg.text).toContain('Ritmo ideal até hoje');
  });

  it('relatório: horas só para pioneiros', () => {
    const s = [{ date: '2026-10-02', min: 0, kind: 'Casa em casa' }];
    expect(reportText('pub', s, 1, '2026-10-20')).toBe('Relatório de outubro de 2026\nParticipei no ministério: sim\nEstudos bíblicos: 1');
    expect(reportText('aux', [{ ...s[0], min: 120 }], 0, '2026-10-20')).toContain('Horas: 2h');
    expect(reportText('pub', s, 0, '2026-11-02')).toContain('Participei no ministério: não');
  });
});
