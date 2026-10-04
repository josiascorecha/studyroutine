import { useEffect, useState } from 'react';
import { actions } from '../../app/actions';
import { useAudioVersion, useServices } from '../../app/context';
import type { DayView } from '../../app/derive';
import { ASSIGNMENT_TYPES, newId, T, type Assignment, type MidweekPrep } from '../../app/model';
import { addDays, cap, dayWordDm, fmtAudio, fmtTime, shortDay } from '../../domain/dates';
import { links } from '../../domain/links';
import { CheckRow, ExternalLink, PageHead, Progress, Segment } from '../components';
import type { Nav } from '../App';

export type MeetTab = 'fim' | 'meio';

export function Meetings({ view, nav, tab, setTab }: { view: DayView; nav: Nav; tab: MeetTab; setTab: (t: MeetTab) => void }) {
  const svc = useServices();
  useAudioVersion();
  return (
    <div className="stack">
      <PageHead eyebrow="Preparação" title="Reuniões" />
      <Segment
        label="Reunião"
        options={[
          { v: 'fim', label: 'Fim de semana' },
          { v: 'meio', label: 'Meio de semana' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'fim' ? <Weekend view={view} nav={nav} /> : <Midweek view={view} nav={nav} svcRepo={svc.repo} />}
    </div>
  );
}

function Weekend({ view, nav }: { view: DayView; nav: Nav }) {
  const svc = useServices();
  const a = actions(svc, view);
  const { s, wtPrep } = view;
  const article = svc.audio.article(view.weekend.week);
  const paras = wtPrep.paras ?? 0;
  const marked = wtPrep.marked.filter((n) => n <= paras);
  const favNums = wtPrep.favs.map((f) => f.p);
  const [notes, setNotes] = useState(wtPrep.favs.map((f) => f.note));
  useEffect(() => setNotes(wtPrep.favs.map((f) => f.note)), [view.weekend.week]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (n: number) => void a.updateWatchtower({ marked: marked.includes(n) ? marked.filter((x) => x !== n) : [...marked, n] });
  const all = marked.length === paras && paras > 0;
  const setFav = (i: number, patch: Partial<{ p: number | null; note: string }>) => {
    const favs = wtPrep.favs.map((f, j) => (j === i ? { ...f, ...patch } : f));
    void a.updateWatchtower({ favs });
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="kicker">
          {cap(dayWordDm(view.weekend.date))} às {fmtTime(s.wkTime)} · Estudo de A Sentinela
        </div>
        <div className="card-title">{article?.title ?? 'Artigo de estudo desta semana'}</div>
        {!article && <div className="small">O título aparece quando o app consegue consultar o áudio oficial da edição.</div>}
        <div className="row-btns">
          <ExternalLink href={article?.docid ? links.wolDoc(article.docid) : links.meetings(view.weekend.date)}>Abrir artigo</ExternalLink>
          {article && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                void a.playWatchtower().then((ok) => {
                  if (!ok) nav.notify('O áudio oficial não está disponível agora.');
                })
              }
            >
              Ouvir · {fmtAudio(article.duration)}
            </button>
          )}
          {s.alexa && (
            <button type="button" className="btn" onClick={() => nav.sheet({ type: 'alexa', ctx: { kind: 'wt' } })}>
              Alexa
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Parágrafos preparados</h2>
          <span className="pill">
            {marked.length} de {paras}
          </span>
        </div>
        <div className="muted">Marque as respostas no JW Library e toque aqui nos parágrafos que já preparou.</div>
        <Progress value={paras ? (marked.length * 100) / paras : 0} />
        {!paras && <div className="note">Informe quantos parágrafos tem o artigo com o botão + (uma vez por semana).</div>}
        <div className="par-grid">
          {Array.from({ length: paras }, (_, i) => i + 1).map((n) => {
            const fav = favNums.includes(n);
            return (
              <button
                key={n}
                type="button"
                className={fav ? 'par fav' : 'par'}
                aria-pressed={marked.includes(n)}
                aria-label={`Parágrafo ${n}${marked.includes(n) ? ', preparado' : ''}${fav ? ', favorito' : ''}`}
                onClick={() => toggle(n)}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div className="row-btns">
          <button
            type="button"
            className="btn"
            disabled={!paras}
            onClick={() => void a.updateWatchtower({ marked: all ? [] : Array.from({ length: paras }, (_, i) => i + 1) })}
          >
            {all ? 'Desmarcar todos' : 'Marquei todos'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <span className="small">{paras} parágrafos</span>
            <button type="button" className="step" aria-label="Um parágrafo a menos" onClick={() => void a.updateWatchtower({ paras: Math.max(0, paras - 1) })}>
              −
            </button>
            <button type="button" className="step" aria-label="Um parágrafo a mais" onClick={() => void a.updateWatchtower({ paras: Math.min(40, paras + 1) })}>
              +
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Favoritos para comentar</h2>
          <span className="pill">até 2</span>
        </div>
        {wtPrep.favs.map((f, i) => (
          <div className="box" key={i}>
            <label className="field">
              Favorito {i + 1}
              <select className="input" value={f.p ?? ''} onChange={(e) => setFav(i, { p: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Escolher parágrafo</option>
                {Array.from({ length: paras }, (_, j) => j + 1).map((n) => (
                  <option key={n} value={n}>
                    Parágrafo {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Meu comentário, com minhas palavras
              <textarea
                className="input"
                value={notes[i] ?? ''}
                placeholder="Uma ideia curta, que encoraje"
                onChange={(e) => setNotes((ns) => ns.map((x, j) => (j === i ? e.target.value : x)))}
                onBlur={() => setFav(i, { note: notes[i] ?? '' })}
              />
            </label>
          </div>
        ))}
        <button type="button" className="btn primary" onClick={() => nav.sheet({ type: 'card', title: article?.title ?? 'Estudo de A Sentinela' })}>
          Ver cartão da reunião
        </button>
      </section>
    </div>
  );
}

function Midweek({ view, nav, svcRepo }: { view: DayView; nav: Nav; svcRepo: ReturnType<typeof useServices>['repo'] }) {
  const { s, win, plan, week, midPrep } = view;
  const [joias, setJoias] = useState(midPrep.joias);
  const [type, setType] = useState(ASSIGNMENT_TYPES[0]);
  useEffect(() => setJoias(midPrep.joias), [win.meeting.week]); // eslint-disable-line react-hooks/exhaustive-deps
  const upd = (patch: Partial<MidweekPrep>) => void svcRepo.put<MidweekPrep>(T.midweek, win.meeting.week, { ...midPrep, ...patch });
  const readDone = !!plan && plan.progress >= plan.total;
  const assigns = svcRepo.list<Assignment>(T.assignment).filter((x) => x.data.week === win.meeting.week);
  const d = (n: number) => shortDay(addDays(win.meeting.date, -n));

  return (
    <div className="stack">
      <section className="card">
        <div className="kicker">
          {cap(dayWordDm(win.meeting.date))} às {fmtTime(s.midTime)} · Meio de semana
        </div>
        <div className="card-title">Vida e Ministério</div>
        <ExternalLink href={links.meetings(win.meeting.date)}>Abrir programação da semana</ExternalLink>
      </section>

      <section className="card" aria-label="Checklist da reunião">
        <CheckRow on={readDone} label="Leitura da semana" onToggle={() => nav.go('leitura')}>
          <span className="row-title">Leitura da semana</span>
          <span className="small">{plan ? `${plan.progress} de ${plan.total} versículos · atualizado pela aba Leitura` : 'Leitura ainda não cadastrada'}</span>
        </CheckRow>
        <CheckRow on={midPrep.joiasOk} label="Joias espirituais preparadas" onToggle={() => upd({ joiasOk: !midPrep.joiasOk })}>
          <span className="row-title">Joias espirituais</span>
          <textarea
            className="input"
            aria-label="Comentário para Joias espirituais"
            placeholder="Um ponto que você quer comentar"
            value={joias}
            onChange={(e) => setJoias(e.target.value)}
            onBlur={() => upd({ joias })}
          />
        </CheckRow>
        <CheckRow on={midPrep.faca} label="Lições do ministério revisadas" onToggle={() => upd({ faca: !midPrep.faca })}>
          <span className="row-title">Faça seu melhor no ministério</span>
          <span className="small">
            {week?.lessons?.length
              ? `Lições ${week.lessons.join(', ')} de “Ame as Pessoas — Faça Discípulos”.`
              : 'Marque as lições desta semana em Leitura › Alterar trecho, se quiser.'}
          </span>
          <ExternalLink href={links.lmd()} className="btn ghost">
            Abrir a brochura
          </ExternalLink>
        </CheckRow>
        <CheckRow on={midPrep.cbs} label="Estudo bíblico de congregação preparado" onToggle={() => upd({ cbs: !midPrep.cbs })}>
          <span className="row-title">Estudo bíblico de congregação</span>
          <span className="small">O capítulo da semana está na programação.</span>
          {s.alexa && (
            <button type="button" className="btn ghost" onClick={() => nav.sheet({ type: 'alexa', ctx: { kind: 'cbs' } })}>
              Ouvir pela Alexa
            </button>
          )}
        </CheckRow>
      </section>

      <section className="card" aria-label="Designações">
        <h2>Designação</h2>
        {assigns.length === 0 && <div className="muted">Nenhuma designação nesta reunião.</div>}
        {assigns.map((x) => (
          <div className="box" key={x.key}>
            <div className="card-head">
              <span className="row-title">{x.data.type}</span>
              <button type="button" className="btn ghost" onClick={() => void svcRepo.remove(T.assignment, x.key)}>
                Remover
              </button>
            </div>
            <span className="small">
              Lembretes: {d(7)} · {d(3)} · {d(1)}. Ensaio sugerido: {d(3)}.
            </span>
          </div>
        ))}
        <label className="field">
          Tipo
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {ASSIGNMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => void svcRepo.put<Assignment>(T.assignment, newId(), { week: win.meeting.week, type })}>
          Adicionar designação
        </button>
      </section>
    </div>
  );
}
