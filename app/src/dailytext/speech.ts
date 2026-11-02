import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { isNative } from '../app/platform';
import { speechChunks } from '../domain/dailyTextSpeech';

/**
 * Leitura em voz alta com a voz do próprio aparelho (Android: mecanismo de "Texto para fala";
 * navegador: speechSynthesis). Nada sai do aparelho.
 */
export type VoiceCheck = 'ok' | 'sem-voz' | 'sem-suporte';

export async function checkVoice(): Promise<VoiceCheck> {
  if (!isNative() && !('speechSynthesis' in window)) return 'sem-suporte';
  try {
    if (isNative()) {
      const { supported } = await TextToSpeech.isLanguageSupported({ lang: 'pt-BR' });
      return supported ? 'ok' : 'sem-voz';
    }
    // No navegador a lista de vozes chega aos poucos; sem lista, deixa o navegador escolher.
    const { languages } = await TextToSpeech.getSupportedLanguages();
    return !languages.length || languages.some((l) => /^pt/i.test(l)) ? 'ok' : 'sem-voz';
  } catch {
    return isNative() ? 'sem-voz' : 'sem-suporte';
  }
}

/** Abre a instalação de vozes do Android. */
export function installVoice(): Promise<void> {
  return TextToSpeech.openInstall().catch(() => {});
}

let run = 0;

/** No navegador, prefere uma voz em português que roda no próprio aparelho (algumas vozes do Chrome usam a rede). */
async function webVoice(): Promise<number | undefined> {
  if (isNative()) return undefined;
  try {
    const { voices } = await TextToSpeech.getSupportedVoices();
    const pt = (v: { lang: string }) => /^pt[-_]BR$/i.test(v.lang);
    const i = voices.findIndex((v) => pt(v) && v.localService);
    if (i >= 0) return i;
    const j = voices.findIndex(pt);
    return j >= 0 ? j : undefined;
  } catch {
    return undefined;
  }
}

/** Fala o texto em pedaços (algumas vozes cortam falas longas). */
export async function speak(text: string, rate: number): Promise<'fim' | 'parado' | 'erro'> {
  const id = ++run;
  const voice = await webVoice();
  for (const chunk of speechChunks(text)) {
    if (id !== run) return 'parado';
    try {
      await TextToSpeech.speak({ text: chunk, lang: 'pt-BR', rate, pitch: 1, volume: 1, category: 'playback', voice });
    } catch {
      return id === run ? 'erro' : 'parado';
    }
  }
  return id === run ? 'fim' : 'parado';
}

export function stopSpeaking(): void {
  run++;
  void TextToSpeech.stop().catch(() => {});
}
