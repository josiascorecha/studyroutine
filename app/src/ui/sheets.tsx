import { useMemo, useState } from 'react';
import { useServices } from '../app/context';
import { weekRangeLabel, type DayView } from '../app/derive';
import { suggestWeek, T, type WeekRecord } from '../app/model';
import { alexa } from '../domain/alexa';
import { BOOK_NAMES, bookName, chapterCount } from '../domain/bible';
import { fmtTime, shortDay, type DayKey } from '../domain/dates';
import { links } from '../domain/links';
import { chaptersIn, portionLabel } from '../domain/reading';
import { ExternalLink, Sheet } from './components';

export type AlexaContext = { kind: 'dt' } | { kind: 'leitura' } | { kind: 'wt' } | { kind: 'cbs' } | { kind: 'lff'; lesson: number };

export function AlexaSheet({ ctx, view, onClose, onHeard }: { ctx: AlexaContext; view: DayView; onClose: () => void; onHeard?: () => void }) {
  const cmds: string[] = [];
  let title = 'Pela Alexa';
  let note = '';
  let routine = false;
  if (ctx.kind === 'dt') {
    title = 'Texto diário pela Alexa';
    cmds.push(alexa.dailyText());
    routine = true;
  } else if (ctx.kind === 'leitura' && view.plan && view.week) {
    title = 'Leitura pela Alexa';
    const r = view.plan.todayRange ?? (view.plan.todayDone ? ([view.plan.todayDone.from!, view.plan.todayDone.to!] as [number, number]) : null);
    if (r) {
      for (const c of chaptersIn(view.plan.units, r[0], r[1])) cmds.push(alexa.chapter(bookName(view.week.book), c));
      note = `A Alexa toca o capítulo inteiro. A porção de hoje é ${portionLabel(view.week.book, view.plan.units, r[0], r[1])}.`;
    }
    cmds.push(alexa.weekReading(view.alexaPhrase));
  } else if (ctx.kind === 'wt') {
    title = 'A Sentinela pela Alexa';
    cmds.push(alexa.watchtower());
    note = 'Bom para preparar enquanto faz outra coisa. A marcação das respostas continua no JW Library.';
  } else if (ctx.kind === 'cbs') {
    title = 'Estudo de congregação pela Alexa';
    cmds.push(alexa.congregationStudy());
    if (view.alexaPhrase !== 'desta semana') note = 'Para a Alexa a semana começa na segunda-feira: peça a partir de segunda para ouvir o estudo desta reunião.';
  } else if (ctx.kind === 'lff') {
    title = 'Lição pela Alexa';
    cmds.push(alexa.lffLesson(ctx.lesson));
  }
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack" style={{ gap: 10 }}>
        <div className="muted">Diga perto do seu Echo:</div>
        {cmds.map((c) => (
          <div className="cmd" key={c}>
            “{c}”
          </div>
        ))}
        {note && <div className="small">{note}</div>}
        {routine && (
          <div className="note">
            Para ouvir todo dia sem pedir: no app Alexa, crie uma Rotina. Quando: todo dia às {fmtTime(view.s.dtTime)}. Ação: Personalizado, com o
            texto “{alexa.dailyTextRoutine()}”.
          </div>
        )}
        <div className="small">A Amazon não permite que outro app acione a Alexa. O StudyRoutine mostra o comando certo e registra quando você ouviu.</div>
        <div className="row-btns">
          {onHeard && (
            <button type="button" className="btn primary" onClick={onHeard}>
              Ouvi pela Alexa
            </button>
          )}
          <ExternalLink href={links.alexaSkill()}>Skill oficial</ExternalLink>
          <ExternalLink href={links.alexaHelp()}>Lista de comandos</ExternalLink>
        </div>
      </div>
    </Sheet>
  );
}

/** Cadastro do trecho da semana: o início já vem sugerido, a pessoa confere na apostila e confirma. */
export function WeekSheet({ week, meetingDate, onClose }: { week: DayKey; meetingDate: DayKey; onClose: () => void }) {
  const { repo } = useServices();
  const existing = repo.get<WeekRecord>(T.week, week);
  const initial = useMemo(() => existing ?? { ...suggestWeek(repo, week), lessons: [] }, [repo, week, existing]);
  const [book, setBook] = useState(initial.book);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [lessons, setLessons] = useState<number[]>(initial.lessons ?? []);
  const max = chapterCount(book);
  const chapters = Array.from({ length: max }, (_, i) => i + 1);

  const save = async () => {
    await repo.put<WeekRecord>(T.week, week, { book, from, to: Math.max(from, to), lessons: [...lessons].sort((a, b) => a - b) });
    onClose();
  };

  return (
    <Sheet title="Leitura da semana" onClose={onClose}>
      <div className="muted">
        Semana de {weekRangeLabel(week)}, para a reunião de {shortDay(meetingDate)}. Confira o trecho na programação e confirme.
      </div>
      <ExternalLink href={links.meetings(meetingDate)}>Conferir na programação</ExternalLink>
      <label className="field">
        Livro
        <select
          className="input"
          value={book}
          onChange={(e) => {
            const b = Number(e.target.value);
            setBook(b);
            setFrom(1);
            setTo(Math.min(2, chapterCount(b)));
          }}
        >
          {BOOK_NAMES.map((n, i) => (
            <option key={n} value={i + 1}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <label className="field">
          Do capítulo
          <select
            className="input"
            value={from}
            onChange={(e) => {
              const f = Number(e.target.value);
              setFrom(f);
              if (to < f) setTo(f);
            }}
          >
            {chapters.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Até o capítulo
          <select className="input" value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {chapters
              .filter((c) => c >= from)
              .map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="field">
        <span className="field-title">Lições de “Ame as Pessoas — Faça Discípulos” desta reunião (opcional)</span>
        <span className="small">Viram o foco das suas saídas de campo na semana seguinte.</span>
        <div className="lesson-grid" role="group" aria-label="Lições">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className="par"
              aria-pressed={lessons.includes(n)}
              aria-label={`Lição ${n}`}
              onClick={() => setLessons((l) => (l.includes(n) ? l.filter((x) => x !== n) : [...l, n]))}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="btn primary wide" onClick={() => void save()}>
        Salvar {bookName(book)} {from === to ? from : `${from}–${to}`}
      </button>
    </Sheet>
  );
}

export function MeetingCardSheet({ view, title, onClose }: { view: DayView; title: string; onClose: () => void }) {
  const favs = view.wtPrep.favs.filter((f) => f.p);
  return (
    <Sheet title="Cartão da reunião" onClose={onClose}>
      <div className="muted">
        {title} · {shortDay(view.weekend.date)} às {fmtTime(view.s.wkTime)}
      </div>
      {favs.length === 0 && <div className="note">Escolha até 2 parágrafos favoritos para aparecerem aqui no dia da reunião.</div>}
      {favs.map((f) => (
        <div className="fav-card" key={f.p!}>
          <div className="par-label">Parágrafo {f.p}</div>
          <div className="text">{f.note || 'Sem anotação'}</div>
        </div>
      ))}
    </Sheet>
  );
}
