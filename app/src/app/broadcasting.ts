import { fetchJson } from '../audio/official';
import type { Repo } from '../data/repo';

/**
 * Programa mensal da JW Broadcasting: o app só descobre qual é o mais recente (título e chave)
 * no serviço de vídeos do jw.org e abre o link oficial; o vídeo nunca passa pelo app.
 */
export interface MonthlyProgram {
  title: string;
  lank: string;
  published: string;
}

export const jwbApi = {
  monthly: 'https://b.jw-cdn.org/apis/mediator/v1/categories/T/StudioMonthlyPrograms?detailed=0&clientType=www',
};

export function pickLatestProgram(data: unknown): MonthlyProgram | null {
  const media = (data as { category?: { media?: { title?: string; languageAgnosticNaturalKey?: string; firstPublished?: string }[] } })?.category?.media ?? [];
  const ok = media
    .filter((m) => m.title && m.languageAgnosticNaturalKey && /^[\w-]+$/.test(m.languageAgnosticNaturalKey))
    .map((m) => ({ title: m.title!, lank: m.languageAgnosticNaturalKey!, published: m.firstPublished ?? '' }))
    .sort((a, b) => (a.published < b.published ? 1 : -1));
  return ok[0] ?? null;
}

const KEY = 'jwb:monthly';
const MAX_AGE = 12 * 3600 * 1000;

/** Mais recente, com cache de 12 horas; sem rede, devolve o último conhecido. */
export async function latestProgram(repo: Repo, fetchImpl?: typeof fetch): Promise<MonthlyProgram | null> {
  const cached = await repo.getCache<{ at: number; p: MonthlyProgram }>(KEY);
  if (cached && Date.now() - cached.at < MAX_AGE) return cached.p;
  try {
    const p = pickLatestProgram(await fetchJson(jwbApi.monthly, fetchImpl));
    if (p) await repo.setCache(KEY, { at: Date.now(), p });
    return p ?? cached?.p ?? null;
  } catch {
    return cached?.p ?? null;
  }
}
