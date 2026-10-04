import { useAudioVersion, useServices } from '../../app/context';
import { weekRangeLabel, type DayView } from '../../app/derive';
import { saveSettings } from '../../app/model';
import { alexa } from '../../domain/alexa';
import { cap, DIAS, dayWordDm, fmtAudio, fmtTime, shortDay } from '../../domain/dates';
import { links } from '../../domain/links';
import { portionLabel, portionSeconds, type RowStatus, type SplitMode } from '../../domain/reading';
import { ExternalLink, PageHead, Progress, Segment } from '../components';
import type { Nav } from '../App';

const SPLITS: { v: SplitMode; label: string }[] = [
  { v: 'capitulos', label: 'Capítulos' },
  { v: 'versos', label: 'Versículos' },
  { v: 'minutos', label: 'Minutos' },
];

const PILL: Record<RowStatus, { label: string; cls: string }> = {
  lido: { label: 'Feito', cls: 'pill ok' },
  hoje: { label: 'Hoje', cls: 'pill today' },
  planejado: { label: 'Planejado', cls: 'pill' },
  folga: { label: 'Folga', cls: 'pill' },
  perdido: { label: 'Ajustado', cls: 'pill warn' },
  antes: { label: 'Antes', cls: 'pill' },
};

export function Reading({ view, nav }: { view: DayView; nav: Nav }) {
  const { repo } = useServices();
  useAudioVersion();
  const { s, plan, week, win } = view;
  const hasAudio = !!plan && portionSeconds(plan.units, 0, plan.total) != null;

  const setException = (v: string) => {
    const ex = { ...s.exceptions };
    if (v) ex[win.meeting.week] = Number(v);
    else delete ex[win.meeting.week];
    void saveSettings(repo, { exceptions: ex });
  };

  return (
    <div className="stack">
      <PageHead eyebrow={`Para a reunião de ${dayWordDm(win.meeting.date)} às ${fmtTime(s.midTime)}`} title="Leitura da semana" />

      {plan && week ? (
        <>
          <section className="card">
            <div className="card-title">{portionLabel(week.book, plan.units, 0, plan.total)}</div>
            <div className="muted">
              {plan.total} versículos{plan.totalSeconds != null ? ` · ${fmtAudio(plan.totalSeconds)} de áudio oficial` : ''}
            </div>
            <Progress value={(plan.progress * 100) / plan.total} />
            <div className="small">
              {plan.progress} de {plan.total} versículos da semana
            </div>
            {s.alexa && <div className="cmd">“{alexa.weekReading(view.alexaPhrase)}”</div>}
            <div className="row-btns">
              <button type="button" className="btn ghost" onClick={() => nav.sheet({ type: 'week' })}>
                Alterar trecho
              </button>
              <ExternalLink href={links.meetings(win.meeting.date)} className="btn ghost">
                Ver programação
              </ExternalLink>
            </div>
          </section>

          <div className="field">
            <span className="field-title">Dividir a leitura por</span>
            <Segment label="Dividir a leitura por" options={SPLITS} value={s.splitMode} onChange={(v) => void saveSettings(repo, { splitMode: v })} />
            {s.splitMode === 'minutos' && !hasAudio && <span className="small">A divisão por minutos usa o áudio oficial. Até ele ser baixado, a divisão é por versículos.</span>}
          </div>

          {plan.missed && <div className="note warn">Um dia ficou sem leitura. Redistribuí o restante até {dayWordDm(win.end)}, sem acumular num dia só.</div>}

          <section className="card" aria-label="Dias de leitura">
            {plan.rows.map((r) => {
              let label = '';
              let sub = '';
              if (r.from !== undefined && r.to !== undefined) {
                label = portionLabel(week.book, plan.units, r.from, r.to);
                const secs = portionSeconds(plan.units, r.from, r.to);
                sub =
                  r.status === 'lido'
                    ? r.via === 'audio'
                      ? 'Ouvido no áudio oficial'
                      : r.via === 'alexa'
                        ? 'Ouvido pela Alexa'
                        : 'Lido'
                    : secs != null
                      ? `${fmtAudio(secs)} de áudio`
                      : `${r.to - r.from} versículos`;
              } else if (r.status === 'folga') {
                label = 'Folga';
                sub = 'Sem leitura neste dia';
              } else if (r.status === 'perdido') {
                label = 'Ficou sem leitura';
                sub = 'O restante foi redistribuído';
              } else {
                label = 'Antes de começar';
                sub = 'Você começou a usar o app depois';
              }
              return (
                <div className="day-row" key={r.date}>
                  <div className="day">{shortDay(r.date)}</div>
                  <div className="body">
                    <div className="row-title">{label}</div>
                    <div className="small">{sub}</div>
                  </div>
                  <span className={PILL[r.status].cls}>{PILL[r.status].label}</span>
                </div>
              );
            })}
          </section>
        </>
      ) : (
        <section className="card">
          <div className="card-title">Cadastre a leitura desta semana</div>
          <div className="muted">
            Semana de {weekRangeLabel(win.meeting.week)}. Confira o trecho na programação; o início já vem sugerido a partir da semana anterior.
          </div>
          <div className="row-btns">
            <button type="button" className="btn primary" onClick={() => nav.sheet({ type: 'week' })}>
              Cadastrar leitura
            </button>
            <ExternalLink href={links.meetings(win.meeting.date)}>Ver programação</ExternalLink>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Semana especial</h2>
        <div className="muted">Visita do superintendente ou outra mudança? Ajuste só esta semana e a leitura é recalculada.</div>
        <label className="field">
          Reunião da semana de {weekRangeLabel(win.meeting.week)}
          <select className="input" value={s.exceptions[win.meeting.week] ? String(s.exceptions[win.meeting.week]) : ''} onChange={(e) => setException(e.target.value)}>
            <option value="">Dia normal ({DIAS[s.midDay]})</option>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={String(d)}>
                {cap(DIAS[d])}
              </option>
            ))}
          </select>
        </label>
      </section>
    </div>
  );
}
