import { useSyncExternalStore } from 'react';
import { isNative } from './platform';

/**
 * Instalar a versão web como app (atalho na tela inicial). No Chrome/Edge/Android o navegador
 * entrega o evento `beforeinstallprompt`, guardado aqui para o botão "Instalar". No iPhone/iPad
 * não há evento: o app mostra o caminho pelo botão Compartilhar.
 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallState {
  /** Já está aberto como app instalado (ou é o app Android). */
  installed: boolean;
  /** O navegador oferece a instalação com um toque. */
  canPrompt: boolean;
  /** iPhone/iPad: só pelo menu Compartilhar. */
  ios: boolean;
}

let deferred: InstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

function standalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    isNative() ||
    justInstalled ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

let snapshot: InstallState = { installed: false, canPrompt: false, ios: false };
function compute(): InstallState {
  const next = { installed: standalone(), canPrompt: !!deferred, ios: !standalone() && isIos() };
  if (next.installed !== snapshot.installed || next.canPrompt !== snapshot.canPrompt || next.ios !== snapshot.ios) snapshot = next;
  return snapshot;
}

/** Chamar o quanto antes (o evento pode chegar antes de a tela montar). */
export function listenForInstall(): void {
  if (typeof window === 'undefined' || isNative()) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    justInstalled = true;
    notify();
  });
}

/** Mostra o pedido do navegador. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferred;
  if (!e) return 'unavailable';
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === 'accepted') justInstalled = true;
  notify();
  return outcome;
}

export function useInstall(): InstallState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    compute,
    compute,
  );
}
