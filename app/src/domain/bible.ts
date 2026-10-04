import { VERSE_COUNTS } from './versification';

/** Nomes dos 66 livros em português, na ordem e numeração usadas nos links do jw.org (1 = Gênesis). */
export const BOOK_NAMES = [
  'Gênesis', 'Êxodo', 'Levítico', 'Números', 'Deuteronômio', 'Josué', 'Juízes', 'Rute', '1 Samuel', '2 Samuel',
  '1 Reis', '2 Reis', '1 Crônicas', '2 Crônicas', 'Esdras', 'Neemias', 'Ester', 'Jó', 'Salmos', 'Provérbios',
  'Eclesiastes', 'Cântico de Salomão', 'Isaías', 'Jeremias', 'Lamentações', 'Ezequiel', 'Daniel', 'Oseias', 'Joel', 'Amós',
  'Obadias', 'Jonas', 'Miqueias', 'Naum', 'Habacuque', 'Sofonias', 'Ageu', 'Zacarias', 'Malaquias', 'Mateus',
  'Marcos', 'Lucas', 'João', 'Atos', 'Romanos', '1 Coríntios', '2 Coríntios', 'Gálatas', 'Efésios', 'Filipenses',
  'Colossenses', '1 Tessalonicenses', '2 Tessalonicenses', '1 Timóteo', '2 Timóteo', 'Tito', 'Filêmon', 'Hebreus', 'Tiago', '1 Pedro',
  '2 Pedro', '1 João', '2 João', '3 João', 'Judas', 'Apocalipse',
] as const;

export const BOOK_COUNT = 66;
export const TOTAL_CHAPTERS = 1189;

export function isBook(num: number): boolean {
  return Number.isInteger(num) && num >= 1 && num <= BOOK_COUNT;
}

export function bookName(num: number): string {
  if (!isBook(num)) throw new Error(`Livro inválido: ${num}`);
  return BOOK_NAMES[num - 1];
}

export function chapterCount(num: number): number {
  if (!isBook(num)) throw new Error(`Livro inválido: ${num}`);
  return VERSE_COUNTS[num - 1].length;
}

export function verseCount(num: number, chapter: number): number {
  const n = VERSE_COUNTS[num - 1]?.[chapter - 1];
  if (!n) throw new Error(`Capítulo inválido: ${num}:${chapter}`);
  return n;
}

/** Próximo capítulo depois de (livro, capítulo), passando para o livro seguinte quando preciso. */
export function nextChapter(book: number, chapter: number): { book: number; chapter: number } | null {
  if (chapter < chapterCount(book)) return { book, chapter: chapter + 1 };
  if (book < BOOK_COUNT) return { book: book + 1, chapter: 1 };
  return null;
}

/** "Jeremias 40", "Jeremias 40–41". */
export function chapterRangeLabel(book: number, from: number, to: number): string {
  return `${bookName(book)} ${from === to ? from : `${from}–${to}`}`;
}
