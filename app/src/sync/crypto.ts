/**
 * Criptografia de ponta a ponta do StudyRoutine (WebCrypto, sem bibliotecas).
 *
 * - A chave de recuperação (28 caracteres, ~137 bits) é gerada e fica só nos aparelhos.
 * - Dela saem, por HKDF-SHA256: o id do cofre, o token de acesso ao servidor,
 *   a chave AES-256-GCM dos dados e a chave HMAC dos identificadores.
 * - O servidor recebe só o id do cofre, o token (guarda o SHA-256) e blobs cifrados.
 * Detalhes em docs/sincronizacao.md.
 */

export const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export const KEY_LENGTH = 28;
const FORMAT_VERSION = 1;
const PAD_BLOCK = 256;

type Bytes = Uint8Array<ArrayBuffer>;

const enc = new TextEncoder();
const dec = new TextDecoder();
const utf8 = (s: string): Bytes => new Uint8Array(enc.encode(s));

export function toB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Bytes {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('base64url inválido');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Gera a chave com amostragem por rejeição (sem viés de módulo). */
export function generateRecoveryKey(random: (n: number) => Bytes = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const limit = Math.floor(256 / KEY_ALPHABET.length) * KEY_ALPHABET.length; // 240
  let out = '';
  while (out.length < KEY_LENGTH) {
    for (const b of random(KEY_LENGTH * 2)) {
      if (b < limit) out += KEY_ALPHABET[b % KEY_ALPHABET.length];
      if (out.length === KEY_LENGTH) break;
    }
  }
  return formatKey(out);
}

/** "ABCD-EFGH-…" (grupos de 4). */
export function formatKey(raw: string): string {
  return raw.match(/.{1,4}/g)!.join('-');
}

/** Aceita minúsculas, espaços e hífens. Devolve a chave formatada ou null se inválida. */
export function normalizeKey(input: string): string | null {
  const s = String(input ?? '').toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== KEY_LENGTH) return null;
  for (const ch of s) if (!KEY_ALPHABET.includes(ch)) return null;
  return formatKey(s);
}

export interface VaultKeys {
  vaultId: string; // base64url de 16 bytes
  authToken: string; // base64url de 32 bytes
  encKey: CryptoKey;
  idKey: CryptoKey;
}

const SALT = utf8('studyroutine-v1');

async function hkdfBits(ikm: CryptoKey, info: string, bits: number): Promise<Bytes> {
  const buf = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: utf8(info) }, ikm, bits);
  return new Uint8Array(buf);
}

export async function deriveKeys(recoveryKey: string): Promise<VaultKeys> {
  const normalized = normalizeKey(recoveryKey);
  if (!normalized) throw new Error('Chave de recuperação inválida');
  const ikm = await crypto.subtle.importKey('raw', utf8(normalized.replace(/-/g, '')), 'HKDF', false, ['deriveBits']);
  const [vaultId, authToken, encRaw, idRaw] = await Promise.all([
    hkdfBits(ikm, 'vault-id', 128),
    hkdfBits(ikm, 'auth-token', 256),
    hkdfBits(ikm, 'record-encryption', 256),
    hkdfBits(ikm, 'record-ids', 256),
  ]);
  const encKey = await crypto.subtle.importKey('raw', encRaw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const idKey = await crypto.subtle.importKey('raw', idRaw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return { vaultId: toB64url(vaultId), authToken: toB64url(authToken), encKey, idKey };
}

/**
 * Id do registro no servidor: HMAC da chave local (ex.: "leitura:2026-10-05:2026-10-02").
 * É o mesmo em todos os aparelhos e não revela ao servidor o tipo nem a data do registro.
 */
export async function remoteRecordId(idKey: CryptoKey, localKey: string): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', idKey, utf8(localKey))).slice(0, 16);
  mac[6] = (mac[6] & 0x0f) | 0x80; // versão 8 (UUID personalizado)
  mac[8] = (mac[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function aad(vaultId: string, recordId: string): Bytes {
  return utf8(`sr${FORMAT_VERSION}:${vaultId}:${recordId}`);
}

/** Preenche até múltiplo de 256 bytes para o tamanho não denunciar o tipo de registro. */
function pad(json: string): Bytes {
  const body = utf8(json);
  const total = Math.ceil((body.length + 4) / PAD_BLOCK) * PAD_BLOCK;
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, body.length);
  out.set(body, 4);
  return out;
}

function unpad(bytes: Bytes): string {
  const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (len > bytes.length - 4) throw new Error('Registro corrompido');
  return dec.decode(bytes.subarray(4, 4 + len));
}

export async function encryptRecord(keys: VaultKeys, recordId: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(keys.vaultId, recordId) }, keys.encKey, pad(JSON.stringify(value))),
  );
  const out = new Uint8Array(1 + iv.length + ct.length);
  out[0] = FORMAT_VERSION;
  out.set(iv, 1);
  out.set(ct, 1 + iv.length);
  return toB64url(out);
}

export async function decryptRecord<T = unknown>(keys: VaultKeys, recordId: string, blob: string): Promise<T> {
  const bytes = fromB64url(blob);
  if (bytes[0] !== FORMAT_VERSION) throw new Error('Formato de registro desconhecido');
  const iv = bytes.slice(1, 13);
  const ct = bytes.slice(13);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad(keys.vaultId, recordId) }, keys.encKey, ct),
  );
  return JSON.parse(unpad(plain)) as T;
}
