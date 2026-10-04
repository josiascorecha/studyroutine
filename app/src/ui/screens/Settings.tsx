import { useState } from 'react';
import { useServices, useSyncVersion } from '../../app/context';
import type { DayView } from '../../app/derive';
import { saveSettings, type AppSettings } from '../../app/model';
import { defaultServer, isNative } from '../../app/platform';
import { generateRecoveryKey } from '../../sync/crypto';
import { SyncError } from '../../sync/engine';
import { links } from '../../domain/links';
import { scheduleReminders } from '../../notify/reminders';
import { Chips, ExternalLink, PageHead, Segment, SwitchRow } from '../components';
import { PairForm } from '../PairForm';
import { DEADLINES, MID_DAYS, MODES, THEMES, WK_DAYS, windowPreview } from './Onboarding';
import type { Nav } from '../App';

export function Settings({ view, nav }: { view: DayView; nav: Nav }) {
  const { repo } = useServices();
  const { s, cur } = view;
  const save = (patch: Partial<AppSettings>) => {
    void saveSettings(repo, patch).then(() => {
      if ('reminders' in patch || 'dtTime' in patch || 'readTime' in patch || 'midDay' in patch || 'wkDay' in patch) {
        void scheduleReminders({ ...s, ...patch }).then((r) => {
          if (r === 'denied') nav.notify('Os lembretes precisam de permissão de notificação nas configurações do Android.');
        });
      }
    });
  };

  return (
    <div className="stack">
      <PageHead eyebrow="Tudo fica neste aparelho" title="Ajustes" />

      <section className="card">
        <h2>Aparência</h2>
        <Segment label="Aparência" options={THEMES} value={s.theme} onChange={(v) => save({ theme: v })} />
        <SwitchRow title="Modo simples" hint="Letras e botões maiores." on={s.simple} onChange={(v) => save({ simple: v })} />
      </section>

      <section className="card">
        <h2>Reuniões e leitura</h2>
        <span className="field-title">Meio de semana</span>
        <Chips label="Dia da reunião de meio de semana" options={MID_DAYS} value={s.midDay} onChange={(v) => save({ midDay: v })} />
        <label className="field">
          Horário
          <input className="input" type="time" value={s.midTime} onChange={(e) => save({ midTime: e.target.value || '19:30' })} />
        </label>
        <span className="field-title">Fim de semana</span>
        <Chips label="Dia da reunião de fim de semana" options={WK_DAYS} value={s.wkDay} onChange={(v) => save({ wkDay: v })} />
        <label className="field">
          Horário
          <input className="input" type="time" value={s.wkTime} onChange={(e) => save({ wkTime: e.target.value || '09:00' })} />
        </label>
        <span className="field-title">Terminar a leitura</span>
        <Chips label="Prazo da leitura" options={DEADLINES} value={s.deadline} onChange={(v) => save({ deadline: v })} />
        <div className="note">{windowPreview(s, cur)}</div>
      </section>

      <section className="card">
        <h2>Ministério</h2>
        <div className="stack" style={{ gap: 10 }}>
          {MODES.map((m) => (
            <button key={m.v} type="button" className="option" aria-pressed={s.mode === m.v} onClick={() => save({ mode: m.v })}>
              <strong>{m.label}</strong>
              <span>{m.desc}</span>
            </button>
          ))}
        </div>
        {s.mode !== 'pub' && (
          <label className="field">
            {s.mode === 'aux' ? 'Sua meta de horas no mês' : 'Sua meta de horas no ano de serviço'}
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="A meta que você recebeu"
              value={s.meta ?? ''}
              onChange={(e) => save({ meta: e.target.value ? Number(e.target.value) : null })}
            />
          </label>
        )}
      </section>

      <section className="card">
        <SwitchRow title="Alexa" hint="Comandos de voz da skill oficial do JW.ORG." on={s.alexa} onChange={(v) => save({ alexa: v })} />
        <div className="row-btns">
          <ExternalLink href={links.alexaSkill()}>Skill oficial na Amazon</ExternalLink>
          <ExternalLink href={links.alexaHelp()}>Lista de comandos</ExternalLink>
        </div>
      </section>

      <section className="card">
        <h2>Lembretes</h2>
        {isNative() ? (
          <SwitchRow title="Lembretes no celular" hint="Texto, leitura e véspera das reuniões." on={s.reminders} onChange={(v) => save({ reminders: v })} />
        ) : (
          <div className="small">Os lembretes funcionam no app Android. Na versão web, abra o app quando quiser.</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <label className="field">
            Texto diário
            <input className="input" type="time" value={s.dtTime} onChange={(e) => save({ dtTime: e.target.value || '06:30' })} />
          </label>
          <label className="field">
            Leitura da Bíblia
            <input className="input" type="time" value={s.readTime} onChange={(e) => save({ readTime: e.target.value || '20:00' })} />
          </label>
        </div>
      </section>

      <SyncCard nav={nav} />

      <section className="card">
        <h2>Privacidade</h2>
        <div className="muted">
          Sem cadastro com e-mail, sem anúncios e sem coleta de dados. O app não guarda textos de publicações: ele abre cada conteúdo nas fontes oficiais.
        </div>
        <a className="btn ghost" href="/privacidade">
          Política de privacidade
        </a>
      </section>
    </div>
  );
}

function SyncCard({ nav }: { nav: Nav }) {
  const { sync } = useServices();
  useSyncVersion();
  const [mode, setMode] = useState<'idle' | 'new' | 'enter'>('idle');
  const [newKey, setNewKey] = useState('');
  const [confirm, setConfirm] = useState('');
  const [server, setServer] = useState(sync.meta?.server || defaultServer());
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const meta = sync.meta;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      setMode('idle');
    } catch (e) {
      setError(e instanceof SyncError ? e.message : 'Não foi possível concluir. Confira a conexão e tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const confirmOk = newKey && confirm.trim().toUpperCase() === newKey.replace(/-/g, '').slice(-4);

  return (
    <section className="card" aria-label="Sincronizar aparelhos">
      <div className="card-head">
        <h2>Sincronizar aparelhos</h2>
        <span className={meta ? 'pill ok' : 'pill'}>{meta ? 'Ligada' : 'Desligada'}</span>
      </div>
      <div className="muted">Seus dados vão cifrados para o servidor do StudyRoutine. Só os seus aparelhos têm a chave: o servidor guarda tudo sem conseguir ler.</div>

      {!meta && mode === 'idle' && (
        <div className="row-btns">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setNewKey(generateRecoveryKey());
              setConfirm('');
              setMode('new');
            }}
          >
            Ativar sincronização
          </button>
          <button type="button" className="btn" onClick={() => setMode('enter')}>
            Já tenho uma chave
          </button>
        </div>
      )}

      {!meta && mode === 'new' && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="cmd">
            <div className="small">Sua chave de recuperação</div>
            <div className="key">{newKey}</div>
          </div>
          <div className="note warn">
            Guarde esta chave num gerenciador de senhas ou no papel. Sem ela e sem um aparelho pareado, ninguém recupera os dados, nem o próprio servidor.
          </div>
          <label className="field">
            Para confirmar que guardou, digite os 4 últimos caracteres
            <input className="input" value={confirm} autoComplete="off" spellCheck={false} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <ServerField value={server} onChange={setServer} />
          <div className="row-btns">
            <button type="button" className="btn primary" disabled={!confirmOk || busy} onClick={() => void run(() => sync.activate(newKey, server))}>
              {busy ? 'Ativando…' : 'Ativar'}
            </button>
            <button type="button" className="btn ghost" onClick={() => setMode('idle')}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!meta && mode === 'enter' && <PairForm onDone={() => setMode('idle')} onCancel={() => setMode('idle')} />}

      {meta && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="small" role="status">
            {sync.running
              ? 'Sincronizando…'
              : meta.lastError
                ? meta.lastError
                : meta.lastSyncAt
                  ? `Última sincronização: ${new Date(meta.lastSyncAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`
                  : 'Ainda não sincronizado.'}
          </div>
          {showKey && (
            <div className="cmd">
              <div className="small">Chave de recuperação</div>
              <div className="key">{meta.key}</div>
            </div>
          )}
          <div className="row-btns">
            <button type="button" className="btn" disabled={sync.running} onClick={() => void sync.syncNow()}>
              Sincronizar agora
            </button>
            <button type="button" className="btn" onClick={() => setShowKey(!showKey)}>
              {showKey ? 'Esconder chave' : 'Mostrar chave para parear'}
            </button>
          </div>
          {showKey && <div className="note">No outro aparelho, abra Ajustes › Sincronizar aparelhos › Já tenho uma chave e digite a chave acima.</div>}
          <div className="row-btns">
            <button type="button" className="btn ghost" onClick={() => void sync.disable().then(() => nav.notify('Sincronização desligada neste aparelho. Os dados continuam aqui.'))}>
              Desligar neste aparelho
            </button>
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => {
                if (window.confirm('Apagar o cofre no servidor? Os outros aparelhos deixam de sincronizar. Os dados deste aparelho continuam aqui.')) {
                  void run(() => sync.deleteServerData()).then(() => nav.notify('Dados apagados do servidor.'));
                }
              }}
            >
              Apagar dados do servidor
            </button>
          </div>
          <div className="small">Servidor: {meta.server}</div>
        </div>
      )}
      {error && (
        <div className="note warn" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

function ServerField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(!value);
  if (!open)
    return (
      <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
        Servidor: {value.replace(/^https?:\/\//, '')}
      </button>
    );
  return (
    <label className="field">
      Endereço do servidor
      <input className="input" type="url" inputMode="url" placeholder="https://studyroutine.exemplo.com.br" value={value} onChange={(e) => onChange(e.target.value.trim())} />
    </label>
  );
}
