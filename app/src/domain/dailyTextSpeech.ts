import { BOOK_NAMES } from './bible';
import type { PdfSegment, PdfTextItem } from './dailyTextPdf';

/**
 * Texto do dia para a voz do aparelho. É montado na hora, a partir do PDF oficial que já está no
 * aparelho, só para ser falado: não é guardado, sincronizado nem enviado a lugar nenhum.
 *
 * O PDF desenha acentos como sinais soltos ("Jeov ´a", "devo ¸c ˜ao") e quebra as palavras em
 * pedaços; por isso o texto é remontado pela posição de cada pedaço na linha.
 */

const MARKS: Record<string, string> = {
  '´': '́',
  '`': '̀',
  ˆ: '̂',
  '˜': '̃',
  '¸': '̧',
  '¨': '̈',
};

/** Linhas do trecho, já com os acentos no lugar, na ordem de leitura. */
export function segmentLines(items: PdfTextItem[], seg: PdfSegment): string[] {
  const lines: string[] = [];
  let cur = '';
  let lastY = NaN;
  let lastEnd = NaN;
  let spaceAfter = false;
  let pending = '';
  for (const i of items) {
    const cx = i.x + Math.max(i.w, 0) / 2;
    if (cx < seg.x0 || cx >= seg.x1 || i.y >= seg.top || i.y <= seg.bottom) continue;
    const s = i.str.trim();
    if (!s) {
      if (i.str && !Number.isNaN(lastEnd) && i.w > 1) spaceAfter = true;
      continue;
    }
    if (s.length === 1 && MARKS[s] && i.w < 1) {
      pending += MARKS[s];
      continue;
    }
    if (Number.isNaN(lastY) || Math.abs(i.y - lastY) > 3) {
      if (cur) lines.push(cur);
      cur = '';
    } else if (spaceAfter || i.x - lastEnd > 1) {
      cur += ' ';
    }
    cur += pending ? s[0] + pending + s.slice(1) : s;
    pending = '';
    lastY = i.y;
    lastEnd = i.x + i.w;
    spaceAfter = /\s$/.test(i.str);
  }
  if (cur) lines.push(cur);
  return lines.map((l) => l.replace(/ı/g, 'i').normalize('NFC'));
}

/**
 * Junta as linhas. Palavra partida no fim da linha volta a ser uma só ("aqui-|lo" → "aquilo").
 * Nos pronomes ("aceitá-|la") o hífen também sai: para a voz, "aceitála" soa igual a "aceitá-la".
 */
export function joinLines(lines: string[]): string {
  let out = '';
  for (const l of lines) {
    if (!out) out = l;
    else if (/\p{L}-$/u.test(out) && !/^\p{Lu}/u.test(l)) out = out.slice(0, -1) + l;
    else out += ' ' + l;
  }
  return out;
}

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** "Deut" → "Deuteronômio"; "Obd" → "Obadias"; "2 Crô" → "2 Crônicas". */
export function expandBook(abbr: string): string | null {
  const m = /^([123]) ?(.+)$/.exec(abbr);
  const num = m ? `${m[1]} ` : '';
  const a = plain(m ? m[2] : abbr);
  const names = BOOK_NAMES.filter((n) => (num ? n.startsWith(num) : !/^\d/.test(n)));
  const rest = (n: string) => plain(n.slice(num.length));
  const subseq = (n: string) => {
    let k = 0;
    for (const ch of n) if (ch === a[k]) k++;
    return k === a.length && n[0] === a[0];
  };
  return (
    names.find((n) => rest(n) === a) ??
    names.find((n) => rest(n).startsWith(a)) ??
    names.find((n) => subseq(rest(n))) ??
    null
  );
}

const ORD_M = ['Primeiro', 'Segundo', 'Terceiro'];
const ORD_F = ['Primeira', 'Segunda', 'Terceira'];

/** Como se fala: "1 Coríntios" → "Primeira Coríntios", "2 Reis" → "Segundo Reis". */
function spokenBook(name: string): string {
  if (name === 'Salmos') return 'Salmo';
  const m = /^([123]) (.+)$/.exec(name);
  if (!m) return name;
  const letter = BOOK_NAMES.indexOf(name as (typeof BOOK_NAMES)[number]) >= 44; // de Romanos em diante: cartas
  return `${(letter ? ORD_F : ORD_M)[Number(m[1]) - 1]} ${m[2]}`;
}

/** Ajusta o texto para soar natural na voz: referências bíblicas por extenso, sem a fonte do comentário. */
export function speakable(text: string): string {
  let t = text
    // "1.u de novembro" (o PDF desenha o "º" como "u").
    .replace(/(\d)\.\s?[uº°](?=\s)/g, '$1º')
    // Fonte no fim do comentário: "w24.09 28-29 §§ 11-12".
    .replace(/\s+[a-z]{1,6}\d{2}\.\d{2}\b[^]*$/, '')
    .replace(/§+/g, '');
  // Referências: "Tia. 1:5", "2 Crô. 12:1", "Sal. 32:8", "1 Reis 21:25, 26".
  t = t.replace(/(^|[\s(;—])((?:[123] )?\p{Lu}[\p{Ll}]{0,5})\.? (\d+):(\d+)/gu, (all, pre: string, abbr: string, c: string, v: string) => {
    const name = expandBook(abbr);
    return name ? `${pre}${spokenBook(name)} ${c}, ${v}` : all;
  });
  return t
    .replace(/(\d+):(\d+)/g, '$1, $2')
    .replace(/(\d)\s?[-–]\s?(\d)/g, '$1 a $2')
    .replace(/([.!?,;:”’)])\s*—\s*/g, '$1 ')
    .replace(/\s*—\s*/g, ', ')
    .replace(/^,\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto completo do dia: título, texto bíblico e comentário. */
export function dailyTextForSpeech(pages: { segment: PdfSegment; items: PdfTextItem[] }[]): string {
  const lines = pages.flatMap((p) => segmentLines(p.items, p.segment));
  if (!lines.length) return '';
  const [title, ...rest] = lines;
  return speakable(`${title}. ${joinLines(rest)}`);
}

/** Frases em pedaços curtos: algumas vozes cortam falas longas. */
export function speechChunks(text: string, max = 220): string[] {
  const out: string[] = [];
  let cur = '';
  for (const s of text.split(/(?<=[.!?…;])\s+/)) {
    if (cur && cur.length + s.length + 1 > max) {
      out.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) out.push(cur);
  return out;
}
