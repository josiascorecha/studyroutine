import type { ChapterAudio } from '../src/domain/reading';

/** Marcadores reais do áudio oficial de Jeremias 38–44 (conferidos em 02/10/2026), usados só nos testes. */
const raw: Record<number, { dur: number; m: (number | undefined)[] }> = {
  39: { dur: 200.16, m: [2.703, 13.234, 20.874, 38.204, 51.151, 66.92, 77.466, 85.959, 93.523, 105.968, 118.675, undefined, 133.506, 145.221, 156.946, 162.699, 178.759, 186.044] },
  40: { dur: 245.616, m: [2.469, 19.105, 27.081, 38.58, 59.875, 81.558, 90.196, 107.897, 127.57, 141.84, 158.444, 173.905, 189.474, 196.911, 209.459, 232.66] },
  41: { dur: 227.64, m: [2.634, 19.0, 35.177, 43.219, 48.117, 62.927, 77.435, 85.907, 100.996, 117.465, 139.633, 149.491, 158.695, 167.077, 174.692, 182.609, 205.599, 212.466] },
};

export function jerAudio(c: number): ChapterAudio | undefined {
  const r = raw[c];
  if (!r) return undefined;
  return { url: `https://cfp2.jw-cdn.org/a/teste/2/o/nwt_24_Jer_T_${c}.mp3`, duration: r.dur, starts: r.m };
}

/** Resposta no formato do serviço de download (resumida), para testar a leitura dos metadados. */
export const chapterApiResponse = {
  pubName: 'Jeremias',
  files: {
    T: {
      MP3: [
        {
          title: 'Capítulo 41',
          file: { url: 'https://cfp2.jw-cdn.org/a/b53ed5/2/o/nwt_24_Jer_T_41.mp3' },
          track: 41,
          duration: 227.64,
          markers: {
            bibleBookChapter: 41,
            bibleBookNumber: 24,
            markers: [
              { duration: '00:00:16.365', verseNumber: 1, startTime: '00:00:02.634' },
              { duration: '00:00:16.176', verseNumber: 2, startTime: '00:00:19.000' },
            ],
          },
        },
      ],
    },
  },
};

export const issueApiResponse = {
  pub: 'w',
  issue: '20260800',
  files: {
    T: {
      MP3: [
        { title: 'Não seja enganado por Satanás — Continue confiando em Jeová e Jesus (5-11 de outubro)', file: { url: 'https://cfp2.jw-cdn.org/a/42fa199/1/o/w_T_202608_01.mp3' }, track: 1, duration: 1100.32, docid: 2026520 },
        { title: 'Você pode vencer a luta contra Satanás e os demônios  (12-18 de outubro)', file: { url: 'https://cfp2.jw-cdn.org/a/f6dbfbe/1/o/w_T_202608_02.mp3' }, track: 2, duration: 1018.576, docid: 0 },
        { title: 'Você Sabia?', file: { url: 'https://cfp2.jw-cdn.org/a/x/1/o/w_T_202608_06.mp3' }, track: 6, duration: 190 },
      ],
    },
  },
};
