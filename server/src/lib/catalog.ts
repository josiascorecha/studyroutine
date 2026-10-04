import { readFile } from 'node:fs/promises';
import { z } from 'zod';

/** Só links do jw.org e subdomínios, sempre por HTTPS. */
export function isOfficialUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
    const host = u.hostname.toLowerCase();
    return host === 'jw.org' || host.endsWith('.jw.org');
  } catch {
    return false;
  }
}

const item = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,60}$/),
  titulo: z.string().min(3).max(140),
  descricao: z.string().min(3).max(240),
  url: z.string().refine(isOfficialUrl, 'O catálogo aceita só links https do jw.org e subdomínios'),
  temas: z.array(z.string().regex(/^[a-z0-9-]{2,40}$/)).min(1).max(8),
  publico: z.enum(['todos', 'criancas', 'jovens', 'familia']),
  tipo: z.enum(['artigo', 'video', 'atividade', 'guia', 'publicacao']),
});

export const catalogSchema = z.object({
  versao: z.string(),
  itens: z.array(item).max(2000),
});

export type Catalog = z.infer<typeof catalogSchema>;

export async function loadCatalog(file: string): Promise<Catalog> {
  const raw = JSON.parse(await readFile(file, 'utf8'));
  const parsed = catalogSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Catálogo inválido (${file}): ${msg}`);
  }
  const ids = new Set<string>();
  for (const it of parsed.data.itens) {
    if (ids.has(it.id)) throw new Error(`Catálogo inválido: id repetido "${it.id}"`);
    ids.add(it.id);
  }
  return parsed.data;
}
