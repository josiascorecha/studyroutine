import { describe, expect, it } from 'vitest';
import type { PdfTextItem } from '../src/domain/dailyTextPdf';
import { dailyTextForSpeech, expandBook, joinLines, segmentLines, speakable, speechChunks } from '../src/domain/dailyTextSpeech';

const seg = { page: 1, x0: 0, x1: 160, top: 440, bottom: 0 };
const it_ = (str: string, x: number, y: number, w: number): PdfTextItem => ({ str, x, y, w, h: 8 });

describe('texto do dia para a voz', () => {
  it('remonta palavras e acentos soltos como o PDF oficial desenha', () => {
    // "Sábado, 31" e "devoção exclusiva" no formato real: pedaços, acento solto antes da letra.
    const items = [
      it_('S', 17.03, 431.5, 4.56),
      it_(' ', 21.58, 431.5, 0.27),
      it_('´', 23.7, 435.8, 0.16),
      it_('', 21.61, 431.5, 0),
      it_('a', 21.61, 431.5, 4.22),
      it_('bado,', 25.99, 431.5, 20.05),
      it_(' ', 46.04, 431.5, 0.31),
      it_('31', 48.5, 431.5, 8),
      it_('devo', 54.04, 419.2, 17.32),
      it_(' ', 71.36, 419.2, 0.26),
      it_('¸', 73.39, 419.1, 0.16),
      it_('c', 71.5, 419.2, 3.37),
      it_(' ', 74.87, 419.2, 0.34),
      it_('˜', 77.58, 423, 0.16),
      it_('a', 74.99, 419.2, 3.98),
      it_('o', 78.97, 419.2, 4.04),
      it_(' ', 83.01, 419.2, 0.29),
      it_('exclusiva.', 85.34, 419.2, 30),
      // Fora do trecho (outra coluna): não entra.
      it_('outra coluna', 170, 419.2, 40),
    ];
    expect(segmentLines(items, seg)).toEqual(['Sábado, 31', 'devoção exclusiva.']);
  });

  it('junta palavras partidas no fim da linha', () => {
    expect(joinLines(['compartilhar aqui-', 'lo que aprende. Os ser-', 'vos e aceitá-', 'la de volta', 'Jeová.'])).toBe(
      'compartilhar aquilo que aprende. Os servos e aceitála de volta Jeová.',
    );
  });

  it('livros abreviados por extenso', () => {
    expect(expandBook('Deut')).toBe('Deuteronômio');
    expect(expandBook('Tia')).toBe('Tiago');
    expect(expandBook('Obd')).toBe('Obadias');
    expect(expandBook('Jó')).toBe('Jó');
    expect(expandBook('Fil')).toBe('Filipenses');
    expect(expandBook('Filem')).toBe('Filêmon');
    expect(expandBook('2 Crô')).toBe('2 Crônicas');
    expect(expandBook('1 Cor')).toBe('1 Coríntios');
    expect(expandBook('Xyz')).toBeNull();
  });

  it('fala as referências e tira a fonte do comentário', () => {
    expect(
      speakable(
        'Domingo, 1.u de novembro. Não ficarei ressentido. — Jer. 3:12. Texto (1 Reis 21:25, 26; 2 Crô. 12:1) e (1 Cor. 2:6) e (Sal. 32:8) e (Pro. 2:1-6). w24.08 28 §§ 7-8',
      ),
    ).toBe(
      'Domingo, 1º de novembro. Não ficarei ressentido. Jeremias 3, 12. Texto (Primeiro Reis 21, 25, 26; Segundo Crônicas 12, 1) e (Primeira Coríntios 2, 6) e (Salmo 32, 8) e (Provérbios 2, 1 a 6).',
    );
  });

  it('título com ponto e o resto do dia, inclusive na outra coluna', () => {
    const p1 = [it_('Segunda-feira, 2 de novembro', 17, 284, 100), it_('Se falta sabedoria a', 17, 271, 80), it_('algum de vocês,', 17, 262, 60)];
    const p2 = [it_('que ele persista.', 170, 432, 60)];
    expect(
      dailyTextForSpeech([
        { segment: seg, items: p1 },
        { segment: { ...seg, x0: 157, x1: 315 }, items: p2 },
      ]),
    ).toBe('Segunda-feira, 2 de novembro. Se falta sabedoria a algum de vocês, que ele persista.');
  });

  it('divide em frases curtas', () => {
    const t = Array.from({ length: 10 }, (_, i) => `Frase número ${i} com algumas palavras para encher.`).join(' ');
    const chunks = speechChunks(t, 120);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.length <= 120)).toBe(true);
    expect(chunks.join(' ')).toBe(t);
  });
});
