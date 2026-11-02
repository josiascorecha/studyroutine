import { useEffect, useState } from 'react';
import { isNative } from './platform';

const ENTRY = /\/assets\/index-[\w-]+\.js/;

/** Script principal desta página (o nome muda a cada versão publicada). */
function currentEntry(): string | null {
  for (const s of Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'))) {
    const m = ENTRY.exec(s.src);
    if (m) return m[0];
  }
  return null;
}

/**
 * Versão web instalada no celular: o Android mantém o app aberto em segundo plano e ele não
 * recarrega sozinho. Ao voltar para o app (e a cada 30 min), confere se o servidor tem versão nova.
 */
export function useNewVersion(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (isNative() || !import.meta.env.PROD) return;
    const mine = currentEntry();
    if (!mine) return;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== 'visible' || !navigator.onLine) return;
      busy = true;
      try {
        const html = await fetch('/', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''));
        const latest = ENTRY.exec(html)?.[0];
        if (latest && latest !== mine) setAvailable(true);
      } catch {
        // Sem rede: tenta de novo na próxima volta.
      } finally {
        busy = false;
      }
    };
    void check();
    const id = setInterval(() => void check(), 30 * 60 * 1000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return available;
}
