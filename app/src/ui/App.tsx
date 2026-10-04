import { App as CapApp } from '@capacitor/app';
import { useCallback, useEffect, useState } from 'react';
import { actions } from '../app/actions';
import { useAudioVersion, usePlayer, useRepoVersion, useServices } from '../app/context';
import { deriveDay, type DayView } from '../app/derive';
import type { Theme } from '../app/model';
import { isNative, today } from '../app/platform';
import { filledStarts } from '../domain/reading';
import { bookName } from '../domain/bible';
import { fmtClock } from '../domain/dates';
import { Icon, PlayIcon, Progress, type IconName } from './components';
import { AlexaSheet, MeetingCardSheet, WeekSheet, type AlexaContext } from './sheets';
import { Meetings, type MeetTab } from './screens/Meetings';
import { Ministry } from './screens/Ministry';
import { Onboarding } from './screens/Onboarding';
import { Reading } from './screens/Reading';
import { Settings } from './screens/Settings';
import { Study } from './screens/Study';
import { Today } from './screens/Today';
import { DeleteData, Privacy } from './screens/Legal';

export type Tab = 'hoje' | 'leitura' | 'reunioes' | 'estudo' | 'ministerio' | 'ajustes';
export type SheetState = { type: 'alexa'; ctx: AlexaContext } | { type: 'week' } | { type: 'card'; title: string } | null;

export interface Nav {
  go(tab: Tab, meetTab?: MeetTab): void;
  sheet(s: SheetState): void;
  notify(msg: string): void;
}

const TABS: { k: Tab; label: string; icon: IconName }[] = [
  { k: 'hoje', label: 'Hoje', icon: 'hoje' },
  { k: 'leitura', label: 'Leitura', icon: 'leitura' },
  { k: 'reunioes', label: 'Reuniões', icon: 'reunioes' },
  { k: 'estudo', label: 'Estudo', icon: 'estudo' },
  { k: 'ministerio', label: 'Ministério', icon: 'ministerio' },
];

export function applyTheme(theme: Theme, simple: boolean) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('simples', simple);
}

/** "Hoje" que muda à meia-noite e quando o app volta do segundo plano. */
function useToday(): string {
  const [cur, setCur] = useState(today());
  useEffect(() => {
    const check = () => setCur(today());
    const id = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    let remove: (() => void) | undefined;
    if (isNative()) {
      void CapApp.addListener('resume', check).then((h) => {
        remove = () => void h.remove();
      });
    }
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
      remove?.();
    };
  }, []);
  return cur;
}

export function App() {
  const path = typeof location !== 'undefined' ? location.pathname : '/';
  if (path.startsWith('/privacidade')) return <Privacy />;
  if (path.startsWith('/excluir-dados')) return <DeleteData />;
  return <MainApp />;
}

function MainApp() {
  const svc = useServices();
  useRepoVersion();
  useAudioVersion();
  const cur = useToday();
  const view = deriveDay(svc.repo, svc.audio, cur);
  const [tab, setTab] = useState<Tab>('hoje');
  const [meetTab, setMeetTab] = useState<MeetTab>('fim');
  const [sheet, setSheet] = useState<SheetState>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => applyTheme(view.s.theme, view.s.simple), [view.s.theme, view.s.simple]);

  const w = view.week;
  useEffect(() => {
    if (w) void svc.audio.ensureChapters(w.book, w.from, w.to);
  }, [svc.audio, w?.book, w?.from, w?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void svc.audio.ensureArticle(view.weekend.week);
  }, [svc.audio, view.weekend.week]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(id);
  }, [notice]);

  const nav: Nav = {
    go: useCallback((t: Tab, m?: MeetTab) => {
      setTab(t);
      if (m) setMeetTab(m);
      window.scrollTo({ top: 0 });
    }, []),
    sheet: setSheet,
    notify: setNotice,
  };

  if (!view.s.onboarded) return <Onboarding cur={cur} onTheme={applyTheme} />;

  const a = actions(svc, view);

  return (
    <div className="app">
      <main className="scroll">
        <button type="button" className="settings-btn" aria-label="Ajustes" aria-current={tab === 'ajustes' ? 'page' : undefined} onClick={() => nav.go('ajustes')}>
          <Icon name="ajustes" />
        </button>
        {notice && (
          <div className="note" role="status" style={{ marginBottom: 12, marginRight: 52 }}>
            {notice}
          </div>
        )}
        {tab === 'hoje' && <Today view={view} nav={nav} />}
        {tab === 'leitura' && <Reading view={view} nav={nav} />}
        {tab === 'reunioes' && <Meetings view={view} nav={nav} tab={meetTab} setTab={setMeetTab} />}
        {tab === 'estudo' && <Study view={view} nav={nav} />}
        {tab === 'ministerio' && <Ministry view={view} nav={nav} />}
        {tab === 'ajustes' && <Settings view={view} nav={nav} />}
      </main>

      <PlayerBar view={view} onMark={() => void a.toggleReading('audio')} />

      <nav className="nav" aria-label="Navegação principal">
        {TABS.map((t) => (
          <button key={t.k} type="button" aria-current={tab === t.k ? 'page' : undefined} onClick={() => nav.go(t.k)}>
            <span className="ic">
              <Icon name={t.icon} />
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {sheet?.type === 'alexa' && (
        <AlexaSheet
          ctx={sheet.ctx}
          view={view}
          onClose={() => setSheet(null)}
          onHeard={
            sheet.ctx.kind === 'dt' && !a.dailyText().done
              ? () => void a.setDailyText(true, 'alexa').then(() => setSheet(null))
              : sheet.ctx.kind === 'leitura' && view.plan?.todayRange
                ? () => void a.toggleReading('alexa').then(() => setSheet(null))
                : undefined
          }
        />
      )}
      {sheet?.type === 'week' && <WeekSheet week={view.win.meeting.week} meetingDate={view.win.meeting.date} onClose={() => setSheet(null)} />}
      {sheet?.type === 'card' && <MeetingCardSheet view={view} title={sheet.title} onClose={() => setSheet(null)} />}
    </div>
  );
}

function PlayerBar({ view, onMark }: { view: DayView; onMark: () => void }) {
  const { player, audio } = useServices();
  const st = usePlayer();
  if (!st) return null;
  let where = '';
  const w = view.week;
  if (w && st.title.startsWith('Leitura')) {
    const seg = player.state ? st.segment : 0;
    const chapterAudio = audio.chapter(w.book, getChapter(view, seg));
    if (chapterAudio) {
      const starts = filledStarts(chapterAudio, chapterAudio.starts.length);
      let v = 1;
      starts.forEach((t, i) => {
        if (t <= st.fileTime + 0.01) v = i + 1;
      });
      where = `${bookName(w.book)} ${getChapter(view, seg)}:${v}`;
    }
  }
  const canMark = st.title.startsWith('Leitura de hoje') && !!view.plan?.todayRange && !view.plan?.todayDone;
  return (
    <div className="player" aria-label="Reprodutor de áudio">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" className="play" aria-label={st.playing ? 'Pausar' : 'Tocar'} onClick={() => player.toggle()}>
          <PlayIcon playing={st.playing} />
        </button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="row-title">{st.title}</span>
          <span className="small">
            {where ? `${where} · ` : ''}
            {fmtClock(st.pos)} / {fmtClock(st.total)}
          </span>
        </div>
        <button type="button" className="btn ghost" aria-label="Voltar 10 segundos" onClick={() => player.back(10)}>
          −10 s
        </button>
        <button type="button" className="btn ghost" aria-label="Fechar o áudio" onClick={() => player.stop()}>
          Fechar
        </button>
      </div>
      <Progress value={st.total ? (st.pos * 100) / st.total : 0} />
      {st.error && <span className="small">{st.error}</span>}
      {canMark && (
        <button type="button" className="btn primary" onClick={onMark}>
          Marcar como ouvida
        </button>
      )}
      <span className="small">Áudio oficial do jw.org.</span>
    </div>
  );
}

function getChapter(view: DayView, segment: number): number {
  const p = view.plan;
  if (!p) return 0;
  const r = p.todayRange ?? (p.todayDone ? [p.todayDone.from!, p.todayDone.to!] : null);
  if (!r) return 0;
  const cs: number[] = [];
  for (let i = r[0]; i < r[1]; i++) if (!cs.includes(p.units[i].c)) cs.push(p.units[i].c);
  return cs[segment] ?? cs[0];
}
