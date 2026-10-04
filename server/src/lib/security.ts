import { createHash, createHmac } from 'node:crypto';

export function sha256(value: Buffer | string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Hash do IP para os limites de tentativa: o IP em claro nunca vai para o banco. */
export function ipBucket(pepper: string, ip: string): string {
  return createHmac('sha256', pepper).update(`ip:${ip}`).digest('base64url').slice(0, 22);
}

const B64URL = /^[A-Za-z0-9_-]+$/;

/** Decodifica base64url exigindo o tamanho exato em bytes; devolve null se inválido. */
export function decodeB64url(value: string, bytes: number): Buffer | null {
  if (typeof value !== 'string' || !B64URL.test(value)) return null;
  const buf = Buffer.from(value, 'base64url');
  if (buf.length !== bytes || buf.toString('base64url') !== value) return null;
  return buf;
}

/** Lê o token do cabeçalho Authorization: Bearer <base64url de 32 bytes>. */
export function bearerToken(header: string | undefined): Buffer | null {
  if (!header || header.length > 100) return null;
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header);
  if (!m) return null;
  return decodeB64url(m[1], 32);
}
