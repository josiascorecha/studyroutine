import { useEffect, useState } from 'react';
import { defaultServer } from '../../app/platform';
import { deriveKeys, normalizeKey } from '../../sync/crypto';
import { SyncError } from '../../sync/engine';
import { httpTransport } from '../../sync/http';
import { PageHead } from '../components';

/** Política de privacidade (rascunho para revisão jurídica antes da publicação). */
export function Privacy() {
  const [contact, setContact] = useState('');
  useEffect(() => {
    const base = defaultServer();
    if (!base) return;
    fetch(`${base}/api/v1/info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { contactEmail?: string } | null) => setContact(j?.contactEmail ?? ''))
      .catch(() => {});
  }, []);
  return (
    <main className="scroll" style={{ maxWidth: 680, margin: '0 auto' }}>
      <div className="stack">
        <PageHead eyebrow="StudyRoutine" title="Política de privacidade" sub="Versão preliminar de 04/10/2026. Precisa de revisão jurídica antes da publicação." />
        <section className="card">
          <h2>O que fica no seu aparelho</h2>
          <p className="muted">
            Tudo o que você registra no StudyRoutine (configurações, leituras, anotações, preparação das reuniões, saídas de campo, estudos) fica guardado
            no seu aparelho. Não há cadastro, e-mail, senha, anúncios nem ferramentas de análise.
          </p>
          <p className="muted">
            No Android, o backup do próprio sistema (na sua conta Google) pode incluir os dados do app, conforme as configurações do seu celular. Isso é
            controlado por você e pelo Android, não pelo StudyRoutine.
          </p>
        </section>
        <section className="card">
          <h2>Sincronização opcional</h2>
          <p className="muted">
            Se você ativar a sincronização, os registros são cifrados no seu aparelho antes de sair dele (AES-256-GCM), com uma chave que só os seus
            aparelhos conhecem. O servidor guarda apenas esses dados cifrados, um código derivado da chave e contadores de uso. O servidor não consegue ler
            o conteúdo, nem saber o tipo ou a data de cada registro.
          </p>
          <p className="muted">
            Como em qualquer conexão pela internet, o servidor recebe o endereço IP do aparelho. Ele não é gravado junto com os dados: para limitar abusos,
            guardamos apenas um código irreversível do IP por até 2 dias. Os registros técnicos do servidor anotam só o tipo de requisição, sem chaves nem
            conteúdo.
          </p>
          <p className="muted">
            Cofres sem nenhuma sincronização por 18 meses são apagados automaticamente. Você pode apagar o cofre a qualquer momento em Ajustes ou nesta página:
            <a href="/excluir-dados"> excluir meus dados do servidor</a>.
          </p>
        </section>
        <section className="card">
          <h2>Conteúdo das fontes oficiais</h2>
          <p className="muted">
            O app não reproduz textos de publicações. Ele abre o conteúdo no jw.org, no JW Library ou toca o áudio oficial, baixado na hora dos servidores
            oficiais. Ao abrir esses links ou tocar o áudio, o seu aparelho se conecta a esses serviços, que têm suas próprias políticas.
          </p>
        </section>
        <section className="card">
          <h2>Seus direitos</h2>
          <p className="muted">
            Como o servidor não tem como identificar você, os pedidos sobre dados são atendidos pelo próprio app: apagar os dados do aparelho (desinstalando o
            app ou apagando os dados dele) e apagar o cofre do servidor com a sua chave.
          </p>
          {contact && (
            <p className="muted">
              Dúvidas sobre privacidade: <a href={`mailto:${contact}`}>{contact}</a>.
            </p>
          )}
        </section>
        <a className="btn" href="/">
          Voltar ao app
        </a>
      </div>
    </main>
  );
}

/** Página pública para apagar o cofre do servidor (a Google Play exige um link na web). */
export function DeleteData() {
  const [key, setKey] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    const k = normalizeKey(key);
    if (!k) return setError('A chave tem 28 letras e números (sem 0, O, 1, I, L e U). Confira e tente de novo.');
    setState('busy');
    try {
      const keys = await deriveKeys(k);
      await httpTransport(defaultServer()).deleteVault(keys.authToken);
      setState('done');
    } catch (e) {
      setState('idle');
      setError(e instanceof SyncError ? e.message : 'Não foi possível apagar agora. Tente de novo.');
    }
  };

  return (
    <main className="scroll" style={{ maxWidth: 680, margin: '0 auto' }}>
      <div className="stack">
        <PageHead eyebrow="StudyRoutine" title="Excluir meus dados do servidor" />
        <section className="card">
          <p className="muted">
            Os dados no servidor estão cifrados e só podem ser identificados pela sua chave de recuperação. Informe a chave para apagar o cofre na hora. Os
            dados que estão nos seus aparelhos continuam neles: para apagá-los, desinstale o app ou apague os dados dele.
          </p>
          <p className="muted">No app: Ajustes › Sincronizar aparelhos › Apagar dados do servidor.</p>
          {state === 'done' ? (
            <div className="note" role="status">
              Pronto. O cofre e tudo o que havia nele foram apagados do servidor.
            </div>
          ) : (
            <>
              <label className="field">
                Chave de recuperação
                <input className="input" value={key} autoComplete="off" spellCheck={false} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" onChange={(e) => setKey(e.target.value)} />
              </label>
              <button type="button" className="btn primary" disabled={state === 'busy'} onClick={() => void submit()}>
                {state === 'busy' ? 'Apagando…' : 'Apagar do servidor'}
              </button>
            </>
          )}
          {error && (
            <div className="note warn" role="alert">
              {error}
            </div>
          )}
        </section>
        <a className="btn" href="/">
          Voltar ao app
        </a>
      </div>
    </main>
  );
}
