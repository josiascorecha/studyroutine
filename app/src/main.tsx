import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import '@fontsource/newsreader/500.css';
import './ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioStore } from './app/audioStore';
import { ServicesProvider, type Services } from './app/context';
import { getSettings } from './app/model';
import { isNative } from './app/platform';
import { SyncController } from './app/syncController';
import { SegmentPlayer } from './audio/player';
import { Repo } from './data/repo';
import { App, applyTheme } from './ui/App';

async function start() {
  const root = createRoot(document.getElementById('root')!);
  let repo: Repo;
  try {
    repo = await Repo.open();
  } catch {
    root.render(
      <main className="scroll">
        <h1>Não foi possível abrir os dados locais</h1>
        <p className="muted">O navegador pode estar em modo privado ou sem espaço. Tente em uma janela normal.</p>
      </main>,
    );
    return;
  }
  const s = getSettings(repo);
  applyTheme(s.theme, s.simple);
  const services: Services = {
    repo,
    audio: new AudioStore(repo),
    sync: new SyncController(repo),
    player: new SegmentPlayer(),
  };
  await services.sync.load();
  services.sync.startAuto();

  // Na versão web, guarda a interface para abrir sem internet. No Android, os arquivos já vêm no app.
  if (!isNative() && import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  root.render(
    <StrictMode>
      <ServicesProvider value={services}>
        <App />
      </ServicesProvider>
    </StrictMode>,
  );
}

void start();
