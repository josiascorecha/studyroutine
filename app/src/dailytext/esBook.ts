import type { Repo } from '../data/repo';
import { fetchJson } from '../audio/official';
import { buildDailyTextIndex, segmentsFor, type DailyTextIndex, type PdfPageText, type PdfSegment } from '../domain/dailyTextPdf';
import type { DayKey } from '../domain/dates';
import { CapacitorHttp } from '@capacitor/core';
import { isNative } from '../app/platform';

/**
 * Livro do ano "Examine as Escrituras Diariamente" em PDF, baixado do serviço oficial de downloads
 * do jw.org (os Termos permitem apps gratuitos que baixam PDF das áreas públicas). Fica guardado no
 * aparelho; nada dele vai para o servidor do StudyRoutine. A tela mostra a própria página do PDF,
 * recortada no texto do dia.
 */
const API = 'https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS';

export const esApi = {
  metaUrl: (year: number) =>
    `${API}?output=json&pub=es${String(year).slice(2)}&fileformat=PDF&alllangs=0&langwritten=T&txtCMSLang=T`,
};

interface ApiFile {
  title?: string;
  file?: { url?: string; checksum?: string };
  filesize?: number;
}

/** A edição normal (es26_T.pdf). A de letras grandes tem outra diagramação e não ajuda no recorte. */
export function pickPdf(data: unknown, year: number): { url: string; size: number; checksum: string } | null {
  const files = (data as { files?: Record<string, { PDF?: ApiFile[] }> })?.files?.T?.PDF ?? [];
  const name = new RegExp(`/es${String(year).slice(2)}_T\\.pdf$`);
  const f = files.find((x) => x.file?.url && name.test(x.file.url));
  const url = f?.file?.url;
  if (!url || !/^https:\/\/[a-z0-9.-]+\.jw-cdn\.org\//.test(url)) return null;
  return { url, size: f?.filesize ?? 0, checksum: f?.file?.checksum ?? '' };
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** No Android baixa pelo lado nativo (sem CORS); no navegador tenta direto e, se o CDN recusar, desiste. */
async function download(url: string): Promise<ArrayBuffer> {
  if (isNative()) {
    const res = await CapacitorHttp.get({ url, responseType: 'arraybuffer', connectTimeout: 15000, readTimeout: 120000 });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = res.data as unknown;
    if (typeof data === 'string') return b64ToBytes(data).buffer as ArrayBuffer;
    if (data instanceof ArrayBuffer) return data;
    throw new Error('Resposta inesperada');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.arrayBuffer();
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsPromise: Promise<PdfJs> | null = null;

/** pdf.js só é carregado quando a pessoa abre a leitura (não pesa na abertura do app). */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= (async () => {
    const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  })();
  return pdfjsPromise;
}

type PdfDoc = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;

async function openDoc(bytes: ArrayBuffer): Promise<PdfDoc> {
  const lib = await loadPdfJs();
  // Cópia: o pdf.js transfere o buffer para o worker.
  return lib.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false, disableFontFace: true }).promise;
}

async function pagesText(doc: PdfDoc): Promise<PdfPageText[]> {
  const out: PdfPageText[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = (tc.items as { str?: string; transform?: number[]; width?: number; height?: number }[])
      .filter((i) => typeof i.str === 'string' && i.transform)
      .map((i) => ({ str: i.str!, x: i.transform![4], y: i.transform![5], w: i.width ?? 0, h: i.height ?? 0 }));
    out.push({ width: vp.width, height: vp.height, items });
    page.cleanup();
  }
  return out;
}

export type EsStatus = 'pronto' | 'indisponivel';

export interface EsBookDeps {
  repo: Repo;
  fetchImpl?: typeof fetch;
  downloader?: (url: string) => Promise<ArrayBuffer>;
}

/** Guarda o PDF e o índice do ano no aparelho; baixa uma vez por ano. */
export class EsBook {
  private doc: PdfDoc | null = null;
  private index: DailyTextIndex | null = null;
  private loading: Promise<boolean> | null = null;

  constructor(
    private deps: EsBookDeps,
    readonly year: number,
  ) {}

  private key(kind: 'pdf' | 'index') {
    return `es:${kind}:${this.year}`;
  }

  /** Já está no aparelho? (sem baixar nada) */
  async isCached(): Promise<boolean> {
    return !!(await this.deps.repo.getCache<ArrayBuffer>(this.key('pdf')));
  }

  /** Garante PDF + índice. onProgress recebe mensagens curtas para a tela. */
  ensure(onProgress?: (msg: string) => void): Promise<boolean> {
    this.loading ??= this.load(onProgress).finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async load(onProgress?: (msg: string) => void): Promise<boolean> {
    if (this.doc && this.index) return true;
    const { repo } = this.deps;
    let bytes = await repo.getCache<ArrayBuffer>(this.key('pdf'));
    if (!bytes) {
      onProgress?.('Consultando o jw.org…');
      const meta = pickPdf(await fetchJson(esApi.metaUrl(this.year), this.deps.fetchImpl), this.year);
      if (!meta) return false;
      onProgress?.(`Baixando o livro de ${this.year}${meta.size ? ` (${(meta.size / 1048576).toFixed(1)} MB)` : ''}, só desta vez…`);
      bytes = await (this.deps.downloader ?? download)(meta.url);
      await repo.setCache(this.key('pdf'), bytes);
    }
    this.doc = await openDoc(bytes);
    let index: DailyTextIndex | null = (await repo.getCache<DailyTextIndex>(this.key('index'))) ?? null;
    if (!index) {
      onProgress?.('Preparando o livro no aparelho…');
      index = buildDailyTextIndex(await pagesText(this.doc), this.year);
      if (!index) return false;
      await repo.setCache(this.key('index'), index);
    }
    this.index = index;
    return true;
  }

  segments(day: DayKey): PdfSegment[] | null {
    return this.index ? segmentsFor(this.index, day) : null;
  }

  /** Desenha os pedaços do dia, um canvas por pedaço, na largura pedida (px CSS). */
  async render(day: DayKey, cssWidth: number): Promise<HTMLCanvasElement[]> {
    const segs = this.segments(day);
    if (!this.doc || !segs?.length) return [];
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    const out: HTMLCanvasElement[] = [];
    for (const s of segs) {
      const page = await this.doc.getPage(s.page);
      const base = page.getViewport({ scale: 1 });
      const scale = (cssWidth / (s.x1 - s.x0)) * dpr;
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil((s.x1 - s.x0) * scale);
      canvas.height = Math.ceil((s.top - s.bottom) * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Desloca a página para o canto do recorte: x0 à esquerda, `top` no alto.
      await page.render({
        canvasContext: ctx,
        viewport: vp,
        transform: [1, 0, 0, 1, -s.x0 * scale, -(base.height - s.top) * scale],
      }).promise;
      out.push(canvas);
      page.cleanup();
    }
    return out;
  }
}
