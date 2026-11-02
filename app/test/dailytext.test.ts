import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildDailyTextIndex, parseHeading, segmentsFor, type PdfPageText } from '../src/domain/dailyTextPdf';
import { pickPdf } from '../src/dailytext/esBook';

async function pagesOf(path: string): Promise<PdfPageText[]> {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)), isEvalSupported: false }).promise;
  const out: PdfPageText[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const p = await doc.getPage(n);
    const vp = p.getViewport({ scale: 1 });
    const tc = await p.getTextContent();
    out.push({
      width: vp.width,
      height: vp.height,
      items: (tc.items as { str: string; transform: number[]; width: number; height: number }[]).map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height })),
    });
  }
  return out;
}

describe('títulos do livro do texto diário', () => {
  it('reconhece o título mesmo com acentos soltos do PDF', () => {
    expect(parseHeading('Ter ¸ c a- f ei r a , 3 de f e v e r ei r o')).toEqual({ day: 3, month: 2, weekday: 2 });
    expect(parseHeading('Quinta-feira, 1.u de janeiro')).toEqual({ day: 1, month: 1, weekday: 4 });
    expect(parseHeading('Quinta-feira, 1.º de janeiro')).toEqual({ day: 1, month: 1, weekday: 4 });
    expect(parseHeading('S ´ abado, 5 de mar ¸ co')).toEqual({ day: 5, month: 3, weekday: 6 });
    expect(parseHeading('Segunda-feira, 2 de novembro')).toEqual({ day: 2, month: 11, weekday: 1 });
    expect(parseHeading('Como o texto de hoje mostra')).toBeNull();
    expect(parseHeading('Segunda-feira, 2 de novembro e mais texto')).toBeNull();
  });
});

describe('índice do PDF', () => {
  it('acha os 365 dias, em ordem, e recorta o dia mesmo quando passa para outra coluna', async () => {
    const pages = await pagesOf('e2e/fixtures/es-teste-2026.pdf');
    const idx = buildDailyTextIndex(pages, 2026);
    expect(idx).not.toBeNull();
    expect(Object.keys(idx!.days)).toHaveLength(365);
    for (const segs of Object.values(idx!.days)) {
      expect(segs.length).toBeGreaterThan(0);
      for (const s of segs) expect(s.top).toBeGreaterThan(s.bottom);
    }
    const multi = Object.values(idx!.days).filter((s) => s.length > 1);
    expect(multi.length).toBeGreaterThan(10);
    // Um dia que continua na outra coluna: o 2.º pedaço começa no alto da coluna.
    const s = multi[0];
    expect(s[1].top).toBeGreaterThan(400);
    expect(segmentsFor(idx!, '2026-11-02')).toEqual(idx!.days['11-02']);
    expect(segmentsFor(idx!, '2027-11-02')).toBeNull();
  });

  it('recusa um livro de outro ano ou com dia faltando', async () => {
    const pages = await pagesOf('e2e/fixtures/es-teste-2026.pdf');
    expect(buildDailyTextIndex(pages, 2027)).toBeNull();
    const cut = pages.map((p, i) => (i === 40 ? { ...p, items: [] } : p));
    expect(buildDailyTextIndex(cut, 2026)).toBeNull();
  });

  it('escolhe só o PDF normal do ano, em servidor oficial', () => {
    const data = {
      files: {
        T: {
          PDF: [
            { file: { url: 'https://cfp2.jw-cdn.org/a/x/1/o/es26_T.pdf', checksum: 'abc' }, filesize: 3145258 },
            { file: { url: 'https://cfp2.jw-cdn.org/a/y/1/o/eslp26_T.pdf' }, filesize: 3842234 },
          ],
        },
      },
    };
    expect(pickPdf(data, 2026)).toEqual({ url: 'https://cfp2.jw-cdn.org/a/x/1/o/es26_T.pdf', size: 3145258, checksum: 'abc' });
    expect(pickPdf(data, 2027)).toBeNull();
    expect(pickPdf({ files: { T: { PDF: [{ file: { url: 'https://exemplo.com/es26_T.pdf' } }] } } }, 2026)).toBeNull();
  });
});
