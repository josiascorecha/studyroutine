import { useState } from 'react';
import { useServices } from '../app/context';
import { defaultServer } from '../app/platform';
import { normalizeKey } from '../sync/crypto';
import { SyncError } from '../sync/engine';

/** Parear este aparelho com um cofre que já existe (chave criada em outro aparelho). */
export function PairForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { sync } = useServices();
  const [key, setKey] = useState('');
  const [server, setServer] = useState(sync.meta?.server || defaultServer());
  const [editServer, setEditServer] = useState(!server);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!normalizeKey(key)) return setError('A chave tem 28 letras e números (sem 0, O, 1, I, L e U). Confira e tente de novo.');
    if (!server) return setError('Informe o endereço do servidor de sincronização.');
    setBusy(true);
    try {
      await sync.activate(key, server, 'pair');
      onDone();
    } catch (e) {
      setError(e instanceof SyncError ? e.message : 'Não foi possível parear. Confira a conexão e tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <label className="field">
        Chave de recuperação
        <input
          className="input"
          value={key}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      {editServer ? (
        <label className="field">
          Endereço do servidor
          <input className="input" type="url" inputMode="url" placeholder="https://studyroutine.exemplo.com.br" value={server} onChange={(e) => setServer(e.target.value.trim())} />
        </label>
      ) : (
        <button type="button" className="btn ghost" onClick={() => setEditServer(true)}>
          Servidor: {server.replace(/^https?:\/\//, '')}
        </button>
      )}
      <div className="row-btns">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Pareando…' : 'Parear este aparelho'}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {error && (
        <div className="note warn" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
