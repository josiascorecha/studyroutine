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

const ALEXA_PACKAGE = 'com.amazon.dee.app';
const ALEXA_PLAY = `https://play.google.com/store/apps/details?id=${ALEXA_PACKAGE}`;

/** O app Alexa só pode ser aberto no celular (Android). No computador não há o que abrir. */
export function canOpenAlexaApp(): boolean {
  return isNative() || (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent));
}

/**
 * Abre o app Alexa no celular. Não existe meio oficial de abrir direto a skill nem de mandar um comando:
 * a pessoa cola o comando na opção de digitar para a Alexa ou fala com o Echo.
 * Sem o app instalado, abre a página dele na Google Play.
 */
export async function openAlexaApp(): Promise<void> {
  if (isNative()) {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher');
      const { completed } = await AppLauncher.openUrl({ url: ALEXA_PACKAGE });
      if (completed) return;
    } catch {
      // segue para a loja
    }
    openExternal(ALEXA_PLAY);
    return;
  }
  // Navegador no Android: o intent abre o app ou, sem ele, a loja.
  location.href = `intent://#Intent;package=${ALEXA_PACKAGE};S.browser_fallback_url=${encodeURIComponent(ALEXA_PLAY)};end`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
