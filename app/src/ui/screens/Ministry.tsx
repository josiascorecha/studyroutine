import { useEffect, useState } from 'react';
import { useRepoVersion, useServices } from '../../app/context';
import type { DayView } from '../../app/derive';
import { newId, sessions, SERVICE_KINDS, students, T } from '../../app/model';
import { cap, fmtMinutes, monthLabel, pad, shortDay } from '../../domain/dates';
import { links } from '../../domain/links';
import { isPartEnd, LFF_LESSONS, lffPart, monthSessions, pioneerPace, reportText, type FieldSession, type Student } from '../../domain/ministry';
import { alexa } from '../../domain/alexa';
import { Chips, ExternalLink, PageHead, Progress } from '../components';
import type { Nav } from '../App';

export function Ministry({ view, nav }: { view: DayView; nav: Nav }) {
  const { repo } = useServices();
  useRepoVersion();
  const { s, cur } = view;
  const isPub = s.mode === 'pub';
  const all = sessions(repo);
  const ms = monthSessions(all, cur);
  const studs = students(repo);
  const pace = pioneerPace(s.mode, s.meta, all, cur);
  const [kind, setKind] = useState(SERVICE_KINDS[0]);
  const [manual, setManual] = useState('');
  const [name, setName] = useState('');
  const [lesson, setLesson] = useState('1');
  const [copied, setCopied] = useState('');
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void repo.getMeta<number | null>('timerStart').then((t) => setTimerStart(t ?? null));
  }, [repo]);
  useEffect(() => {
    if (!timerStart) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timerStart]);

  const addSession = (min: number) => repo.put<FieldSession>(T.session, newId(), { date: cur, min, kind });
  const elapsed = timerStart ? Math.max(0, Math.floor((now - timerStart) / 1000)) : 0;
  const timerText = `${Math.floor(elapsed / 3600)}:${pad(Math.floor((elapsed % 3600) / 60), 2)}:${pad(elapsed % 60, 2)}`;
  const toggleTimer = async () => {
    if (timerStart) {
      const mins = Math.max(1, Math.round((Date.now() - timerStart) / 60000));
      await addSession(mins);
      await repo.setMeta('timerStart', null);
      setTimerStart(null);
    } else {
      const t = Date.now();
      await repo.setMeta('timerStart', t);
      setTimerStart(t);
      setNow(t);
    }
  };
  const report = reportText(s.mode, all, studs.length, cur);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied('Texto copiado.');
    } catch {
      setCopied('Selecione e copie o texto acima.');
    }
  };
  const monthSorted = repo
    .list<FieldSession>(T.session)
    .filter((x) => x.data.date.slice(0, 7) === cur.slice(0, 7))
    .sort((a, b) => (a.data.date < b.data.date ? 1 : -1));

  return (
    <div className="stack">
      <PageHead eyebrow={`${cap(monthLabel(cur))} · ${isPub ? 'Publicador' : s.mode === 'aux' ? 'Pioneiro auxiliar' : 'Pioneiro regular'}`} title="Ministério" />

      <section className="card" aria-label="Resumo do mês">
        {isPub ? (
          <div className="stats">
            <div>
              <div className="small">Participou no ministério</div>
              <div className="stat-value">{ms.length ? 'Sim' : 'Ainda não'}</div>
            </div>
            <div>
              <div className="small">Estudos bíblicos</div>
              <div className="stat-value">{studs.length}</div>
            </div>
          </div>
        ) : (
          <>
            <div className="stats">
              <div>
                <div className="small">{s.mode === 'reg' ? 'Horas no ano de serviço' : 'Horas no mês'}</div>
                <div className="stat-value">{pace?.hoursLabel}</div>
              </div>
              <div>
                <div className="small">Meta</div>
                <div className="stat-value">{s.meta ? `${s.meta}h` : '—'}</div>
              </div>
            </div>
            <Progress value={pace?.percent ?? 0} accent />
            <div className="muted">{pace?.text}</div>
            <div className="small">Estudos bíblicos: {studs.length}</div>
          </>
        )}
      </section>

      <section className="card" aria-label="Registrar saída">
        <h2>Registrar saída</h2>
        <Chips label="Modalidade" options={SERVICE_KINDS.map((k) => ({ v: k, label: k }))} value={kind} onChange={setKind} />
        {isPub ? (
          <button type="button" className="btn primary" onClick={() => void addSession(0)}>
            Registrar saída de hoje
          </button>
        ) : (
          <>
            <div className="timer">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="small">Cronômetro</span>
                <span className="timer-value">{timerText}</span>
              </div>
              <button type="button" className={timerStart ? 'btn done' : 'btn primary'} onClick={() => void toggleTimer()}>
                {timerStart ? 'Encerrar' : 'Iniciar'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: 1 }}>
                Ou lance os minutos
                <input className="input" type="number" inputMode="numeric" min={1} placeholder="Ex.: 90" value={manual} onChange={(e) => setManual(e.target.value)} />
              </label>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const m = parseInt(manual, 10);
                  if (m > 0) {
                    void addSession(m);
                    setManual('');
                  }
                }}
              >
                Adicionar
              </button>
            </div>
          </>
        )}
        {monthSorted.length === 0 && <div className="small">Nenhuma saída registrada neste mês.</div>}
        {monthSorted.map((x) => (
          <div className="day-row" key={x.key}>
            <div className="day">{shortDay(x.data.date)}</div>
            <div className="body">
              <div className="row-title">{x.data.kind}</div>
            </div>
            <span className="pill">{isPub ? 'Participou' : fmtMinutes(x.data.min)}</span>
            <button type="button" className="btn ghost" aria-label={`Remover saída de ${shortDay(x.data.date)}`} onClick={() => void repo.remove(T.session, x.key)}>
              ×
            </button>
          </div>
        ))}
      </section>

      <section className="card" aria-label="Foco da semana">
        <div className="kicker">Da reunião para o campo</div>
        {view.focus ? (
          <>
            <div className="card-title">
              {view.focus.lessons.length > 1 ? 'Lições' : 'Lição'} {view.focus.lessons.join(' e ')}
            </div>
            <div className="muted">De “Ame as Pessoas — Faça Discípulos”, {view.focus.when}.</div>
          </>
        ) : (
          <div className="muted">Marque as lições da reunião ao cadastrar a leitura da semana para ver o foco aqui.</div>
        )}
        <ExternalLink href={links.lmd()}>Abrir Ame as Pessoas — Faça Discípulos</ExternalLink>
      </section>

      <section className="card" aria-label="Estudos bíblicos">
        <h2>Estudos bíblicos</h2>
        {studs.length === 0 && <div className="muted">Cadastre quem você ajuda a estudar com o livro Seja Feliz para Sempre! (60 lições em 4 partes).</div>}
        {studs.map(({ key, data }) => (
          <div className="box" key={key}>
            <div className="card-head">
              <span className="row-title">{data.name}</span>
              <span className="pill">Parte {lffPart(data.lesson)}</span>
            </div>
            <div className="muted">
              Seja Feliz para Sempre! · lição {data.lesson} de {LFF_LESSONS}
            </div>
            <Progress value={(data.lesson * 100) / LFF_LESSONS} />
            {isPartEnd(data.lesson) && <div className="note">Ao terminar esta lição, faça a revisão da parte.</div>}
            {s.alexa && <div className="small">“{alexa.lffLesson(data.lesson)}”</div>}
            <div className="row-btns">
              <button
                type="button"
                className="btn"
                disabled={data.lesson >= LFF_LESSONS}
                onClick={() => void repo.put<Student>(T.student, key, { ...data, lesson: Math.min(LFF_LESSONS, data.lesson + 1) })}
              >
                {data.lesson >= LFF_LESSONS ? 'Curso concluído' : `Ir para a lição ${data.lesson + 1}`}
              </button>
              <ExternalLink href={links.lff()}>Abrir o livro</ExternalLink>
              <button type="button" className="btn ghost" onClick={() => void repo.remove(T.student, key)}>
                Remover
              </button>
            </div>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, alignItems: 'end' }}>
          <label className="field" style={{ gridColumn: 'span 2' }}>
            Nome ou apelido
            <input className="input" value={name} placeholder="Só o primeiro nome" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            Lição atual
            <input className="input" type="number" inputMode="numeric" min={1} max={60} value={lesson} onChange={(e) => setLesson(e.target.value)} />
          </label>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const n = name.trim();
            const l = Math.min(LFF_LESSONS, Math.max(1, parseInt(lesson, 10) || 1));
            if (!n) return nav.notify('Informe o nome ou apelido do estudante.');
            void repo.put<Student>(T.student, newId(), { name: n.slice(0, 40), lesson: l });
            setName('');
            setLesson('1');
          }}
        >
          Adicionar estudante
        </button>
      </section>

      <section className="card" aria-label="Relatório do mês">
        <h2>Relatório do mês</h2>
        <pre className="report">{report}</pre>
        <div className="row-btns">
          <button type="button" className="btn" onClick={() => void copy()}>
            Copiar texto
          </button>
          <span className="small" role="status">
            {copied}
          </span>
        </div>
        <div className="small">O envio continua pelo canal da sua congregação.</div>
      </section>
    </div>
  );
}
