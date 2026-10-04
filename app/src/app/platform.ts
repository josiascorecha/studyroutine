import { Capacitor } from '@capacitor/core';
import { isDayKey, localDayKey, type DayKey } from '../domain/dates';

export const isNative = (): boolean => Capacitor.isNativePlatform();

/** "Hoje" do aparelho. Em builds de teste (VITE_ALLOW_DATE_OVERRIDE=1) aceita ?hoje=AAAA-MM-DD. */
export function today(): DayKey {
  if (import.meta.env.VITE_ALLOW_DATE_OVERRIDE === '1' && typeof location !== 'undefined') {
    const v = new URLSearchParams(location.search).get('hoje');
    if (v && isDayKey(v)) return v;
  }
  return localDayKey();
}

/** Servidor de sincronização: no web, a própria origem; no Android, o endereço definido no build. */
export function defaultServer(): string {
  const fromEnv = (import.meta.env.VITE_SYNC_ORIGIN as string | undefined)?.trim();
  if (isNative()) return fromEnv || '';
  if (typeof location !== 'undefined' && location.origin.startsWith('http')) return location.origin;
  return fromEnv || '';
}

/**
 * Abre o link fora do app. No Android, o sistema escolhe quem abre: o JW Library, quando
 * instalado e associado aos links do jw.org, ou o navegador. No web, uma nova aba.
 */
export function openExternal(url: string): void {
  if (isNative()) {
    void import('@capacitor/app-launcher')
      .then(({ AppLauncher }) => AppLauncher.openUrl({ url }))
      .catch(() => window.open(url, '_blank', 'noopener'));
    return;
  }
  window.open(url, '_blank', 'noopener');
}
