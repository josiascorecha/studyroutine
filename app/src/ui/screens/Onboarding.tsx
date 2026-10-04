import { useState } from 'react';
import { useServices } from '../../app/context';
import { defaultSettings, getSettings, saveSettings, type AppSettings } from '../../app/model';
import { isNative } from '../../app/platform';
import { dayWord, dayWordDm, fmtTime, type DayKey } from '../../domain/dates';
import { readingWindow } from '../../domain/meetings';
import { scheduleReminders } from '../../notify/reminders';
import { Chips, Icon, Segment, SwitchRow } from '../components';
import { PairForm } from '../PairForm';

export const MID_DAYS = [
  { v: 1, label: 'Seg' },
  { v: 2, label: 'Ter' },
  { v: 3, label: 'Qua' },
  { v: 4, label: 'Qui' },
  { v: 5, label: 'Sex' },
];
export const WK_DAYS = [
  { v: 6, label: 'Sábado' },
  { v: 0, label: 'Domingo' },
];
export const DEADLINES = [
  { v: 'vespera' as const, label: 'Na véspera' },
  { v: 'dia' as const, label: 'No dia da reunião' },
];
export const MODES = [
  { v: 'pub' as const, label: 'Publicador', desc: 'Participação no ministério e estudos bíblicos. Sem horas.' },
  { v: 'aux' as const, label: 'Pioneiro auxiliar', desc: 'Controle de horas e da meta do mês.' },
  { v: 'reg' as const, label: 'Pioneiro regular', desc: 'Controle de horas no ano de serviço, de setembro a agosto.' },
];
export const THEMES = [
  { v: 'sistema' as const, label: 'Automático' },
  { v: 'claro' as const, label: 'Claro' },
  { v: 'escuro' as const, label: 'Escuro' },
];

export function windowPreview(s: AppSettings, cur: DayKey): string {
  const w = readingWindow(cur, s);
  if (w.start > w.end) return `Com reunião na ${dayWord(w.meeting.date)}, a leitura vai até o próprio dia da reunião.`;
  return `Com reunião na ${dayWord(w.meeting.date)} às ${fmtTime(s.midTime)}, a leitura desta semana fica entre ${dayWordDm(w.start)} e ${dayWordDm(w.end)}.`;
}

export function Onboarding({ cur, onTheme }: { cur: DayKey; onTheme: (t: AppSettings['theme'], simple: boolean) => void }) {
  const { repo } = useServices();
  const [step, setStep] = useState(0);
  const [pairing, setPairing] = useState(false);
  const [d, setD] = useState<AppSettings>(() => ({ ...defaultSettings(cur), ...getSettings(repo), installDay: cur }));
  const set = (patch: Partial<AppSettings>) => {
    const next = { ...d, ...patch };
    setD(next);
    if (patch.theme !== undefined || patch.simple !== undefined) onTheme(next.theme, next.simple);
  };

  const finish = async () => {
    const final = { ...d, onboarded: true, installDay: cur };
    await saveSettings(repo, final);
    void scheduleReminders(final).catch(() => {});
  };

  return (
    <main className="onb">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        {step > 0 ? (
          <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
            Voltar
          </button>
        ) : (
          <span />
        )}
        <div className="dots" aria-label={`Etapa ${step + 1} de 4`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>
      </div>

      <div className="content">
        {step === 0 && (
          <div className="stack" style={{ gap: 18, paddingTop: 24 }}>
            <div className="logo">
              <Icon name="leitura" size={32} width={1.6} />
            </div>
            <div className="brand">StudyRoutine</div>
            <h1 className="h1-big">Sua rotina espiritual em dia</h1>
            <p className="muted" style={{ margin: 0, fontSize: 'calc(16.5px * var(--scale))' }}>
              Lembretes gentis para o texto diário, a leitura da Bíblia, as reuniões, o estudo e o ministério.
            </p>
            <div className="card">
              <div className="bullet">Tudo abre nas fontes oficiais: JW Library, jw.org e a skill da Alexa.</div>
              <div className="bullet">A leitura da semana é dividida até o dia da sua reunião.</div>
              <div className="bullet">Seus dados ficam neste aparelho. Sem cadastro e sem anúncios.</div>
            </div>
            {pairing ? (
              <section className="card" aria-label="Parear com outro aparelho">
                <h2>Já uso em outro aparelho</h2>
                <div className="muted">Digite a chave de recuperação que aparece em Ajustes › Sincronizar aparelhos no outro aparelho.</div>
                <PairForm
                  onDone={() => {
                    // Se o cofre já tinha configurações, o app abre direto; senão, segue a configuração inicial.
                    if (!getSettings(repo).onboarded) setStep(1);
                  }}
                  onCancel={() => setPairing(false)}
                />
              </section>
            ) : (
              <button type="button" className="btn ghost" onClick={() => setPairing(true)}>
                Já uso o StudyRoutine em outro aparelho
              </button>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="stack" style={{ gap: 18 }}>
            <div className="page-head">
              <div className="eyebrow">Passo 1 de 3</div>
              <h1>Suas reuniões</h1>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                A leitura da semana fica organizada até a reunião de meio de semana.
              </p>
            </div>
            <div className="field">
              <span className="field-title">Reunião de meio de semana</span>
              <Chips label="Dia da reunião de meio de semana" options={MID_DAYS} value={d.midDay} onChange={(v) => set({ midDay: v })} />
              <label className="field">
                Horário
                <input className="input" type="time" value={d.midTime} onChange={(e) => set({ midTime: e.target.value || '19:30' })} />
              </label>
            </div>
            <div className="field">
              <span className="field-title">Reunião de fim de semana</span>
              <Chips label="Dia da reunião de fim de semana" options={WK_DAYS} value={d.wkDay} onChange={(v) => set({ wkDay: v })} />
              <label className="field">
                Horário
                <input className="input" type="time" value={d.wkTime} onChange={(e) => set({ wkTime: e.target.value || '09:00' })} />
              </label>
            </div>
            <div className="field">
              <span className="field-title">Quero terminar a leitura</span>
              <Chips label="Prazo da leitura" options={DEADLINES} value={d.deadline} onChange={(v) => set({ deadline: v })} />
            </div>
            <div className="note">{windowPreview(d, cur)}</div>
          </div>
        )}

        {step === 2 && (
          <div className="stack" style={{ gap: 18 }}>
            <div className="page-head">
              <div className="eyebrow">Passo 2 de 3</div>
              <h1>Seu ministério</h1>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                Isso define o que aparece no resumo do mês.
              </p>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {MODES.map((m) => (
                <button key={m.v} type="button" className="option" aria-pressed={d.mode === m.v} onClick={() => set({ mode: m.v })}>
                  <strong>{m.label}</strong>
                  <span>{m.desc}</span>
                </button>
              ))}
            </div>
            {d.mode !== 'pub' && (
              <label className="field">
                {d.mode === 'aux' ? 'Sua meta de horas no mês' : 'Sua meta de horas no ano de serviço'}
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="A meta que você recebeu"
                  value={d.meta ?? ''}
                  onChange={(e) => set({ meta: e.target.value ? Number(e.target.value) : null })}
                />
              </label>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="stack" style={{ gap: 18 }}>
            <div className="page-head">
              <div className="eyebrow">Passo 3 de 3</div>
              <h1>Do seu jeito</h1>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                Você pode mudar tudo depois em Ajustes.
              </p>
            </div>
            <label className="field">
              Horário do texto diário
              <input className="input" type="time" value={d.dtTime} onChange={(e) => set({ dtTime: e.target.value || '06:30' })} />
            </label>
            <SwitchRow title="Tenho Alexa" hint="Mostro o comando de voz certo em cada tarefa." on={d.alexa} onChange={(v) => set({ alexa: v })} />
            <SwitchRow title="Modo simples" hint="Letras e botões maiores." on={d.simple} onChange={(v) => set({ simple: v })} />
            {isNative() && <SwitchRow title="Lembretes" hint="Avisos no horário do texto, da leitura e na véspera das reuniões." on={d.reminders} onChange={(v) => set({ reminders: v })} />}
            <div className="field">
              <span className="field-title">Aparência</span>
              <Segment label="Aparência" options={THEMES} value={d.theme} onChange={(v) => set({ theme: v })} />
            </div>
          </div>
        )}
      </div>

      <button type="button" className="btn primary wide" onClick={() => (step < 3 ? setStep(step + 1) : void finish())}>
        {step === 0 ? 'Começar' : step === 3 ? 'Concluir' : 'Continuar'}
      </button>
    </main>
  );
}
