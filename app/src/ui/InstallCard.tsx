import { useState } from 'react';
import { promptInstall, useInstall } from '../app/install';

const KEY = 'sr:install-dismissed';
const DAYS = 30;

function dismissedRecently(): boolean {
  try {
    const t = Number(localStorage.getItem(KEY) || 0);
    return Date.now() - t < DAYS * 864e5;
  } catch {
    return false;
  }
}

/**
 * Convite para instalar a versão web como app. `always`: mostra mesmo depois de "Agora não"
 * (usado em Ajustes).
 */
export function InstallCard({ always = false }: { always?: boolean }) {
  const st = useInstall();
  const [hidden, setHidden] = useState(() => !always && dismissedRecently());
  const [msg, setMsg] = useState('');
  if (st.installed || hidden) return null;
  if (!st.canPrompt && !st.ios && !always) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      // Sem armazenamento: só esconde nesta visita.
    }
    setHidden(true);
  };

  return (
    <section className="card install-card" aria-label="Instalar o app">
      <div className="card-title">Instale o StudyRoutine</div>
      <div className="muted">Fica na tela inicial como um app, abre mais rápido e funciona até sem internet.</div>
      {st.canPrompt ? (
        <div className="row-btns">
          <button
            type="button"
            className="btn primary"
            onClick={() =>
              void promptInstall().then((r) => {
                // Recusou no pedido do navegador: some do Hoje por um tempo (continua em Ajustes).
                if (r === 'dismissed' && !always) dismiss();
                if (r === 'dismissed' && always) setMsg('Quando quiser, o navegador volta a oferecer a instalação aqui.');
              })
            }
          >
            Instalar
          </button>
          {!always && (
            <button type="button" className="btn ghost" onClick={dismiss}>
              Agora não
            </button>
          )}
        </div>
      ) : st.ios ? (
        <>
          <ol className="steps small">
            <li>
              Toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima).
            </li>
            <li>
              Escolha <strong>Adicionar à Tela de Início</strong> e confirme.
            </li>
          </ol>
          {!always && (
            <button type="button" className="btn ghost" onClick={dismiss}>
              Agora não
            </button>
          )}
        </>
      ) : (
        <div className="small">
          No Chrome do celular, abra o menu <strong>⋮</strong> e toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
        </div>
      )}
      {msg && (
        <div className="small" role="status">
          {msg}
        </div>
      )}
    </section>
  );
}
