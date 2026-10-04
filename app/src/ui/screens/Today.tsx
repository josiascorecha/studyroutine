import { actions } from '../../app/actions';
import { useAudioVersion, useServices } from '../../app/context';
import type { DayView } from '../../app/derive';
import { familyLog, sessions } from '../../app/model';
import { cap, weekday, dayWordDm, fmtAudio, fmtMinutes, fmtTime, longDay, MESES, shortDay } from '../../domain/dates';
import { links } from '../../domain/links';
import { monthSessions } from '../../domain/ministry';
import { portionLabel, portionRefs, portionSeconds } from '../../domain/reading';
import { ExternalLink, PageHead, PlayIcon, Progress } from '../components';
import type { Nav } from '../App';

export function Today({ view, nav }: { view: DayView; nav: Nav }) {
  const svc = useServices();
  useAudioVersion();
  const a = actions(svc, view);
  const { s, cur, plan, week, win } = view;
  const dt = a.dailyText();

  const meetings = [
    { d: view.weekend.date, t: s.wkTime },
    { d: win.meeting.date, t: s.midTime },
  ].sort((x, y) => (x.d < y.d ? -1 : 1));

  // Leitura
  let rdTitle = 'Leitura desta semana';
  let rdSub = `Cadastre o trecho da apostila para a reunião de ${dayWordDm(win.meeting.date)}.`;
  let rdRange: [number, number] | null = null;
  let rdBadge = '';
  if (plan && week) {
    const deadline = win.end >= win.start ? dayWordDm(win.end) : dayWordDm(win.meeting.date);
    if (plan.todayDone) {
      rdRange = [plan.todayDone.from!, plan.todayDone.to!];
      rdTitle = portionLabel(week.book, plan.units, ...rdRange);
      const next = plan.nextRow ? `Próxima: ${dayWordDm(plan.nextRow.date)}, ${portionLabel(week.book, plan.units, plan.nextRow.from!, plan.nextRow.to!)}.` : plan.progress >= plan.total ? 'Leitura da semana concluída.' : '';
      rdSub = `Feito hoje. ${next}`;
      rdBadge = plan.todayDone.via === 'audio' ? 'Ouvido' : plan.todayDone.via === 'alexa' ? 'Pela Alexa' : 'Feito';
    } else if (plan.todayRange) {
      rdRange = plan.todayRange;
      rdTitle = portionLabel(week.book, plan.units, ...rdRange);
      const secs = portionSeconds(plan.units, ...rdRange);
      const size = secs != null ? `${fmtAudio(secs)} de áudio` : `${rdRange[1] - rdRange[0]} versículos`;
      rdSub = `${size} · ${plan.catchUp ? `reunião hoje às ${fmtTime(s.midTime)}` : `até ${deadline}`}`;
    } else if (plan.progress >= plan.total) {
      rdTitle = 'Leitura da semana concluída';
      rdSub = `Bom proveito na reunião de ${dayWordDm(win.meeting.date)}.`;
    } else if (plan.nextRow) {
      rdTitle = 'Hoje é folga na leitura';
      rdSub = `Próxima: ${dayWordDm(plan.nextRow.date)}, ${portionLabel(week.book, plan.units, plan.nextRow.from!, plan.nextRow.to!)}.`;
    }
  }
  const refs = rdRange && plan ? portionRefs(plan.units, ...rdRange) : null;

  // Preparo da próxima reunião
  const showWt = view.weekend.date <= win.meeting.date;
  const article = svc.audio.article(view.weekend.week);
  const paras = view.wtPrep.paras ?? 0;
  const marked = view.wtPrep.marked.filter((n) => n <= paras).length;
  const favs = view.wtPrep.favs.filter((f) => f.p).length;

  // Ministério
  const ms = monthSessions(sessions(svc.repo), cur);
  const month = MESES[Number(cur.slice(5, 7)) - 1];
  const minLine = `${cap(month)}: ${ms.length ? `${ms.length} ${ms.length === 1 ? 'saída registrada' : 'saídas registradas'}${s.mode !== 'pub' ? ` · ${fmtMinutes(ms.reduce((x, y) => x + y.min, 0))}` : ''}` : 'nenhuma saída registrada ainda'}.`;

  const play = async (fn: () => Promise<boolean>) => {
    const ok = await fn();
    if (!ok) nav.notify('O áudio oficial não está disponível agora. Use "Abrir" ou a Alexa.');
  };

  return (
    <div className="stack">
      <PageHead eyebrow={longDay(cur)} title="Seu dia" sub={`Reuniões: ${meetings.map((m) => `${shortDay(m.d)} às ${fmtTime(m.t)}`).join(' · ')}`} />

      <section className="card" aria-label="Texto diário">
        <div className="card-head">
          <div className="kicker">Texto diário · {fmtTime(s.dtTime)}</div>
          {dt.done && <span className="pill ok">{dt.via === 'alexa' ? 'Pela Alexa' : 'Feito'}</span>}
        </div>
        <div className="card-title">Texto de {longDay(cur).toLowerCase()}</div>
        <div className="muted">Examine as Escrituras Diariamente</div>
        <div className="row-btns">
          <ExternalLink href={links.dailyText(cur)}>Abrir</ExternalLink>
          {s.alexa && (
            <button type="button" className="btn" onClick={() => nav.sheet({ type: 'alexa', ctx: { kind: 'dt' } })}>
              Alexa
            </button>
          )}
          <button type="button" className={dt.done ? 'btn ghost' : 'btn done'} aria-pressed={dt.done} onClick={() => void a.setDailyText(!dt.done)}>
            {dt.done ? 'Desfazer' : 'Marcar como lido'}
          </button>
        </div>
        {dt.done && (
          <label className="field">
            O ponto do texto em poucas palavras
            <input className="input" defaultValue={dt.note} placeholder="Escreva com suas palavras" onBlur={(e) => void a.setDailyNote(e.target.value)} />
          </label>
        )}
      </section>

      <section className="card" aria-label="Leitura da Bíblia">
        <div className="card-head">
          <div className="kicker">Leitura da Bíblia</div>
          {rdBadge && <span className="pill ok">{rdBadge}</span>}
        </div>
        <div className="card-title">{rdTitle}</div>
        <div className="muted">{rdSub}</div>
        {plan?.missed && <div className="note warn">Um dia ficou sem leitura. Redistribuí o restante até a véspera da reunião, sem acumular num dia só.</div>}
        {plan && (
          <>
            <Progress value={(plan.progress * 100) / plan.total} />
            <div className="small">
              {plan.progress} de {plan.total} versículos da semana
            </div>
          </>
        )}
        <div className="row-btns">
          {!week && (
            <button type="button" className="btn primary" onClick={() => nav.sheet({ type: 'week' })}>
              Cadastrar leitura
            </button>
          )}
          {rdRange && refs && week && (
            <>
              <button type="button" className="btn primary" onClick={() => void play(a.playToday)}>
                <PlayIcon playing={false} />
                <span>Ouvir</span>
              </button>
              <ExternalLink href={links.bible(week.book, refs.from.c, refs.from.v, refs.to.c, refs.to.v)}>Abrir</ExternalLink>
              {s.alexa && (
                <button type="button" className="btn" onClick={() => nav.sheet({ type: 'alexa', ctx: { kind: 'leitura' } })}>
                  Alexa
                </button>
              )}
              <button type="button" className={plan?.todayDone ? 'btn ghost' : 'btn done'} aria-pressed={!!plan?.todayDone} onClick={() => void a.toggleReading()}>
                {plan?.todayDone ? 'Desfazer' : 'Marcar como lida'}
              </button>
            </>
          )}
          {week && (
            <button type="button" className="btn ghost" onClick={() => nav.go('leitura')}>
              Ver a semana
            </button>
          )}
        </div>
      </section>

      {showWt ? (
        <section className="card" aria-label="Preparo de A Sentinela">
          <div className="kicker">
            {cap(dayWordDm(view.weekend.date))} às {fmtTime(s.wkTime)} · Estudo de A Sentinela
          </div>
          <div className="card-title">{article?.title ?? 'Artigo de estudo desta semana'}</div>
          <div className="muted">
            {paras ? `${marked} de ${paras} parágrafos preparados` : 'Informe quantos parágrafos tem o artigo'} · {favs} {favs === 1 ? 'favorito' : 'favoritos'}
          </div>
          <Progress value={paras ? (marked * 100) / paras : 0} />
          <div className="row-btns">
            <button type="button" className="btn primary" onClick={() => nav.go('reunioes', 'fim')}>
              Preparar
            </button>
            {article && (
              <button type="button" className="btn" onClick={() => void play(a.playWatchtower)}>
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
      ) : (
        <section className="card" aria-label="Preparo da reunião de meio de semana">
          <div className="kicker">
            {cap(dayWordDm(win.meeting.date))} às {fmtTime(s.midTime)} · Meio de semana
          </div>
          <div className="card-title">Vida e Ministério</div>
          <div className="muted">
            {[plan ? plan.progress >= plan.total : false, view.midPrep.joiasOk, view.midPrep.faca, view.midPrep.cbs].filter(Boolean).length} de 4 itens prontos
          </div>
          <div className="row-btns">
            <button type="button" className="btn primary" onClick={() => nav.go('reunioes', 'meio')}>
              Preparar
            </button>
            <ExternalLink href={links.meetings(win.meeting.date)}>Abrir programação</ExternalLink>
          </div>
        </section>
      )}

      {s.familyDay !== null && weekday(cur) === s.familyDay && (
        <section className="card" aria-label="Adoração em família">
          <div className="kicker">Hoje</div>
          <div className="card-title">Adoração em família</div>
          {familyLog(svc.repo).some((x) => x.data.date === cur) ? (
            <div className="muted">Registrada hoje.</div>
          ) : (
            <div className="muted">Escolha uma ideia e registre quando terminarem.</div>
          )}
          <div className="row-btns">
            <button type="button" className="btn" onClick={() => nav.go('estudo')}>
              Abrir Estudo
            </button>
          </div>
        </section>
      )}

      <section className="card" aria-label="Ministério">
        <div className="kicker">Ministério · foco da semana</div>
        {view.focus ? (
          <>
            <div className="card-title">
              {view.focus.lessons.length > 1 ? 'Lições' : 'Lição'} {view.focus.lessons.join(' e ')}
            </div>
            <div className="muted">De “Ame as Pessoas — Faça Discípulos”, {view.focus.when}.</div>
          </>
        ) : (
          <>
            <div className="card-title">Da reunião para o campo</div>
            <div className="muted">Ao cadastrar a leitura da semana, marque as lições treinadas na reunião para elas aparecerem aqui.</div>
          </>
        )}
        <div className="small">{minLine}</div>
        <div className="row-btns">
          <button type="button" className="btn primary" onClick={() => nav.go('ministerio')}>
            Registrar saída
          </button>
          <ExternalLink href={links.lmd()}>Abrir lições</ExternalLink>
        </div>
      </section>
    </div>
  );
}
