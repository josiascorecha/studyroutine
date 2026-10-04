import { useEffect, type ReactNode } from 'react';
import { isNative, openExternal } from '../app/platform';

const ICONS = {
  hoje: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  leitura: 'M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z',
  reunioes: 'M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M3 10h18 M8 3v4 M16 3v4',
  ministerio: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z M12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
  ajustes: 'M4 7h9 M17 7h3 M15 5v4 M4 17h3 M11 17h9 M9 15v4',
  check: 'M5 12l5 5 9-10',
  estudo: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, width = 1.8 }: { name: IconName; size?: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M8 5v14 M16 5v14" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function Progress({ value, accent }: { value: number; accent?: boolean }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={accent ? 'progress accent' : 'progress'} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function SwitchRow({ title, hint, on, onChange }: { title: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="switch-row">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="field-title">{title}</span>
        {hint && <span className="small">{hint}</span>}
      </div>
      <Switch on={on} label={title} onChange={onChange} />
    </div>
  );
}

export function Chips<T extends string | number>({ options, value, onChange, label }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" className="chip" aria-pressed={o.v === value} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Segment<T extends string>({ options, value, onChange, label }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segment" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={o.v === value} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ExternalLink({ href, children, className = 'btn' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        // No Android, quem abre é o sistema (JW Library ou navegador), não a WebView do app.
        if (isNative()) {
          e.preventDefault();
          openExternal(href);
        }
      }}
    >
      {children}
    </a>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="card-head">
          <h2>{title}</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageHead({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="page-head">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {sub && <div className="muted">{sub}</div>}
    </div>
  );
}

export function CheckRow({ on, label, onToggle, children }: { on: boolean; label: string; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="check-row">
      <button type="button" className="check" aria-pressed={on} aria-label={label} onClick={onToggle}>
        <Icon name="check" size={16} width={3} />
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>{children}</div>
    </div>
  );
}
