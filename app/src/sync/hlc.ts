/**
 * Relógio lógico híbrido: carimbos que crescem sempre, mesmo com relógios de aparelhos
 * levemente diferentes. Formato comparável como texto: "ms(13)-contador(4)-aparelho".
 * Na mesclagem, a versão com carimbo maior vence.
 */
export class Hlc {
  private ms = 0;
  private counter = 0;

  constructor(
    private readonly node: string,
    private readonly now: () => number = Date.now,
    initial?: string,
  ) {
    if (initial) this.receive(initial);
  }

  tick(): string {
    const t = this.now();
    if (t > this.ms) {
      this.ms = t;
      this.counter = 0;
    } else {
      this.counter += 1;
      if (this.counter > 9999) {
        // Mantém o formato fixo: avança 1 ms em vez de estourar o contador.
        this.ms += 1;
        this.counter = 0;
      }
    }
    return this.format();
  }

  /** Avança o relógio ao receber um carimbo de outro aparelho. */
  receive(stamp: string): void {
    const p = parseHlc(stamp);
    if (!p) return;
    if (p.ms > this.ms || (p.ms === this.ms && p.counter > this.counter)) {
      this.ms = p.ms;
      this.counter = p.counter;
    }
  }

  current(): string {
    return this.format();
  }

  private format(): string {
    return `${String(this.ms).padStart(13, '0')}-${String(this.counter).padStart(4, '0')}-${this.node}`;
  }
}

export function parseHlc(stamp: string): { ms: number; counter: number; node: string } | null {
  const m = /^(\d{13})-(\d{4})-([A-Za-z0-9_-]{1,40})$/.exec(stamp ?? '');
  if (!m) return null;
  return { ms: Number(m[1]), counter: Number(m[2]), node: m[3] };
}

export function compareHlc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
