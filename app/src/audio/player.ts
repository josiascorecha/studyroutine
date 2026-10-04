import type { AudioSegment } from '../domain/reading';

export interface PlayerState {
  title: string;
  playing: boolean;
  /** Segundos já tocados, somando todos os trechos. */
  pos: number;
  total: number;
  /** Índice do trecho atual e segundo dentro do arquivo. */
  segment: number;
  fileTime: number;
  done: boolean;
  error: string | null;
}

/**
 * Toca trechos de arquivos MP3 oficiais em sequência (ex.: Jer 40:15 até 41:5 = dois arquivos).
 * Usa um único <audio> e para no fim de cada trecho.
 */
export class SegmentPlayer {
  private audio: HTMLAudioElement;
  private segs: AudioSegment[] = [];
  private idx = 0;
  private listeners = new Set<(s: PlayerState) => void>();
  state: PlayerState | null = null;

  constructor(audio?: HTMLAudioElement) {
    this.audio = audio ?? new Audio();
    this.audio.preload = 'auto';
    this.audio.addEventListener('timeupdate', () => this.onTime());
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('error', () => this.fail('Não foi possível tocar o áudio. Confira a conexão.'));
  }

  subscribe(fn: (s: PlayerState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(patch: Partial<PlayerState>) {
    if (!this.state) return;
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private elapsedBefore(i: number): number {
    return this.segs.slice(0, i).reduce((a, s) => a + (s.end - s.start), 0);
  }

  async play(title: string, segs: AudioSegment[]): Promise<void> {
    this.segs = segs;
    this.idx = 0;
    const total = segs.reduce((a, s) => a + (s.end - s.start), 0);
    this.state = { title, playing: false, pos: 0, total, segment: 0, fileTime: segs[0]?.start ?? 0, done: false, error: null };
    await this.load(0);
  }

  private async load(i: number) {
    const s = this.segs[i];
    if (!s) return this.finish();
    this.idx = i;
    if (this.audio.src !== s.url) this.audio.src = s.url;
    this.audio.currentTime = s.start;
    try {
      await this.audio.play();
      this.emit({ playing: true, segment: i, error: null });
    } catch {
      this.fail('Toque em "Tocar" para começar o áudio.');
    }
  }

  private onTime() {
    const s = this.segs[this.idx];
    if (!s || !this.state) return;
    const t = this.audio.currentTime;
    if (t >= s.end - 0.05) return this.next();
    this.emit({ pos: this.elapsedBefore(this.idx) + Math.max(0, t - s.start), fileTime: t });
  }

  private next() {
    if (this.idx + 1 < this.segs.length) void this.load(this.idx + 1);
    else this.finish();
  }

  private finish() {
    this.audio.pause();
    this.emit({ playing: false, done: true, pos: this.state?.total ?? 0 });
  }

  private fail(msg: string) {
    this.emit({ playing: false, error: msg });
  }

  toggle() {
    if (!this.state) return;
    if (this.state.done) {
      void this.play(this.state.title, this.segs);
      return;
    }
    if (this.audio.paused) {
      void this.audio.play().then(() => this.emit({ playing: true, error: null }), () => this.fail('Não foi possível tocar o áudio.'));
    } else {
      this.audio.pause();
      this.emit({ playing: false });
    }
  }

  back(seconds = 10) {
    const s = this.segs[this.idx];
    if (!s) return;
    this.audio.currentTime = Math.max(s.start, this.audio.currentTime - seconds);
  }

  stop() {
    this.audio.pause();
    this.state = null;
    for (const fn of this.listeners) fn(null as unknown as PlayerState);
  }
}
