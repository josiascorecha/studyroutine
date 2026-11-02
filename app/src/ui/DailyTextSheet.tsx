import { useEffect, useRef, useState } from 'react';
import { actions } from '../app/actions';
import { useServices } from '../app/context';
import type { DayView } from '../app/derive';
import { EsBook } from '../dailytext/esBook';
import { checkVoice, installVoice, speak, stopSpeaking } from '../dailytext/speech';
import { isNative } from '../app/platform';
import type { Repo } from '../data/repo';
import { longDay } from '../domain/dates';
import { links } from '../domain/links';
import { ExternalLink, Sheet } from './components';

/** Página oficial do livro do ano (tem o botão de download), se o serviço de metadados não respondeu. */
const esPage = (year: number) => `https://www.jw.org/finder?wtlocale=T&pub=es${String(year).slice(2)}`;

const books = new Map<number, EsBook>();
function bookFor(repo: Repo, year: number): EsBook {
  let b = books.get(year);
  if (!b) {
    b = new EsBook({ repo }, year);
    books.set(year, b);
  }
  return b;
}

/** Texto do dia direto do PDF oficial do ano, recortado no dia, com leitura pela voz do aparelho. */
export function DailyTextSheet({ view, onClose }: { view: DayView; onClose: () => void }) {
  const svc = useServices();
  const a = actions(svc, view);
  const dt = a.dailyText();
  const { cur } = view;
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'carregando' | 'pronto' | 'arquivo' | 'falhou'>('carregando');
  const [msg, setMsg] = useState('Abrindo o livro…');
  const [fileMsg, setFileMsg] = useState('');
  const alive = useRef(true);
  const year = Number(cur.slice(0, 4));
  const book = bookFor(svc.repo, year);
  const [voice, setVoice] = useState<'parado' | 'preparando' | 'falando'>('parado');
  const [voiceMsg, setVoiceMsg] = useState<'' | 'sem-voz' | 'sem-suporte' | 'erro'>('');
  const [rate, setRate] = useState(1);

  // Fechou a tela ou mudou o dia: a voz para.
  useEffect(() => () => stopSpeaking(), [cur]);

  async function listen() {
    if (voice !== 'parado') {
      stopSpeaking();
      setVoice('parado');
      return;
    }
    setVoiceMsg('');
    setVoice('preparando');
    const check = await checkVoice();
    if (check !== 'ok') {
      setVoice('parado');
      setVoiceMsg(check);
      return;
    }
    const text = await book.speechText(cur);
    if (!alive.current) return;
    if (!text) {
      setVoice('parado');
      setVoiceMsg('erro');
      return;
    }
    setVoice('falando');
    const r = await speak(text, rate);
    if (!alive.current) return;
    if (r !== 'parado') setVoice('parado');
    if (r === 'erro') setVoiceMsg(isNative() ? 'sem-voz' : 'erro');
  }

  async function show(): Promise<void> {
    const width = box.current?.clientWidth || 340;
    const canvases = await book.render(cur, width);
    if (!canvases.length) throw new Error('dia não encontrado');
    if (!alive.current || !box.current) return;
    box.current.replaceChildren(
      ...canvases.map((c) => {
        c.className = 'dt-page';
        c.setAttribute('role', 'img');
        c.setAttribute('aria-label', `Texto diário de ${longDay(cur).toLowerCase()}, página do livro oficial`);
        return c;
      }),
    );
    setState('pronto');
  }

  useEffect(() => {
    alive.current = true;
    (async () => {
      try {
        const st = await book.ensure((m) => alive.current && setMsg(m));
        if (!alive.current) return;
        if (st === 'arquivo') return setState('arquivo');
        if (st !== 'pronto') throw new Error('indisponível');
        await show();
      } catch {
        if (alive.current) setState('falhou');
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [book, cur]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileMsg('Conferindo o arquivo…');
    try {
      const r = await book.importFile(await file.arrayBuffer(), (m) => alive.current && setFileMsg(m));
      if (!alive.current) return;
      if (r !== 'ok') {
        setFileMsg(`Esse arquivo não é o livro de ${year} em português (es${String(year).slice(2)}_T.pdf). Baixe pelo botão acima e escolha de novo.`);
        return;
      }
      setFileMsg('');
      await show();
    } catch {
      if (alive.current) setFileMsg('Não foi possível abrir esse arquivo. Escolha o PDF baixado do jw.org.');
    }
  }

  return (
    <Sheet title="Texto diário" onClose={onClose}>
      <div className="small">{longDay(cur)} · Examine as Escrituras Diariamente</div>
      {state === 'carregando' && (
        <div className="note" role="status">
          {msg}
        </div>
      )}
      {state === 'arquivo' && (
        <div className="dt-import">
          <p className="small">
            No navegador, o jw.org não deixa outro site baixar o livro sozinho. Faça isto uma vez por ano e depois ele abre direto, até sem internet:
          </p>
          <ol className="steps">
            <li>
              <ExternalLink href={book.officialUrl ?? esPage(year)} className="btn">
                Baixar o PDF no jw.org
              </ExternalLink>
            </li>
            <li>
              <label className="btn primary file-btn">
                Escolher o arquivo baixado
                <input type="file" accept="application/pdf,.pdf" onChange={(e) => void onFile(e.target.files?.[0])} />
              </label>
            </li>
          </ol>
          <p className="small">O arquivo é o es{String(year).slice(2)}_T.pdf e fica só neste navegador; nada vai para o servidor.</p>
          {fileMsg && (
            <div className="note" role="status">
              {fileMsg}
            </div>
          )}
        </div>
      )}
      {state === 'falhou' && (
        <div className="note warn" role="alert">
          Não foi possível abrir o livro agora. Confira a internet (só é preciso na primeira vez do ano) ou abra no jw.org.
        </div>
      )}
      {state === 'pronto' && (
        <div className="row-btns dt-voice">
          <button type="button" className="btn primary" aria-pressed={voice !== 'parado'} onClick={() => void listen()}>
            {voice === 'parado' ? 'Ouvir' : voice === 'preparando' ? 'Preparando…' : 'Parar'}
          </button>
          <label className="small dt-rate">
            Velocidade
            <select className="input" value={rate} onChange={(e) => setRate(Number(e.target.value))} disabled={voice !== 'parado'}>
              <option value={0.8}>Devagar</option>
              <option value={1}>Normal</option>
              <option value={1.2}>Rápida</option>
            </select>
          </label>
        </div>
      )}
      {voiceMsg === 'sem-voz' && (
        <div className="note warn" role="alert">
          {isNative() ? (
            <>
              Falta a voz em português no aparelho.{' '}
              <button type="button" className="btn ghost" onClick={() => void installVoice()}>
                Instalar voz
              </button>
            </>
          ) : (
            'Este navegador não tem voz em português. No Android, instale "Português (Brasil)" em Configurações › Acessibilidade › Conversão de texto em voz.'
          )}
        </div>
      )}
      {voiceMsg === 'sem-suporte' && (
        <div className="note warn" role="alert">
          Este navegador não lê em voz alta. Use o Chrome ou o app Android.
        </div>
      )}
      {voiceMsg === 'erro' && (
        <div className="note warn" role="alert">
          Não foi possível ler o texto em voz alta agora.
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
