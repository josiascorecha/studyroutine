import { useEffect, useRef, useState } from 'react';
import { actions } from '../app/actions';
import { useServices } from '../app/context';
import type { DayView } from '../app/derive';
import { isNative } from '../app/platform';
import { EsBook } from '../dailytext/esBook';
import type { Repo } from '../data/repo';
import { longDay } from '../domain/dates';
import { links } from '../domain/links';
import { ExternalLink, Sheet } from './components';

const books = new Map<number, EsBook>();
function bookFor(repo: Repo, year: number): EsBook {
  let b = books.get(year);
  if (!b) {
    b = new EsBook({ repo }, year);
    books.set(year, b);
  }
  return b;
}

/** Texto do dia direto do PDF oficial do ano, recortado no dia: sem copiar o texto, sem sair do app. */
export function DailyTextSheet({ view, onClose }: { view: DayView; onClose: () => void }) {
  const svc = useServices();
  const a = actions(svc, view);
  const dt = a.dailyText();
  const { cur } = view;
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'carregando' | 'pronto' | 'falhou'>('carregando');
  const [msg, setMsg] = useState('Abrindo o livro…');

  useEffect(() => {
    let alive = true;
    const year = Number(cur.slice(0, 4));
    const book = bookFor(svc.repo, year);
    (async () => {
      try {
        const ok = await book.ensure((m) => alive && setMsg(m));
        if (!ok || !alive) throw new Error('indisponível');
        const width = box.current?.clientWidth || 340;
        const canvases = await book.render(cur, width);
        if (!canvases.length) throw new Error('dia não encontrado');
        if (!alive || !box.current) return;
        box.current.replaceChildren(
          ...canvases.map((c) => {
            c.className = 'dt-page';
            c.setAttribute('role', 'img');
            c.setAttribute('aria-label', `Texto diário de ${longDay(cur).toLowerCase()}, página do livro oficial`);
            return c;
          }),
        );
        setState('pronto');
      } catch {
        if (alive) setState('falhou');
      }
    })();
    return () => {
      alive = false;
    };
  }, [svc.repo, cur]);

  return (
    <Sheet title="Texto diário" onClose={onClose}>
      <div className="small">{longDay(cur)} · Examine as Escrituras Diariamente</div>
      {state === 'carregando' && (
        <div className="note" role="status">
          {msg}
        </div>
      )}
      {state === 'falhou' && (
        <div className="note warn" role="alert">
          {isNative()
            ? 'Não foi possível abrir o livro agora. Confira a internet (só é preciso na primeira vez do ano) ou abra no jw.org.'
            : 'No navegador, o jw.org não deixa outro site baixar o livro. No app Android funciona, e sem internet depois da primeira vez. Aqui, abra no jw.org.'}
        </div>
      )}
      <div ref={box} className="dt-pages" aria-live="polite" />
      {state === 'pronto' && <div className="small">Página do PDF oficial do jw.org, guardado neste aparelho.</div>}
      <div className="row-btns">
        <button
          type="button"
          className={dt.done ? 'btn ghost' : 'btn primary'}
          aria-pressed={dt.done}
          onClick={() => void a.setDailyText(!dt.done).then(() => !dt.done && onClose())}
        >
          {dt.done ? 'Desfazer' : 'Marcar como lido'}
        </button>
        <ExternalLink href={links.dailyText(cur)}>Abrir no jw.org</ExternalLink>
      </div>
    </Sheet>
  );
}
