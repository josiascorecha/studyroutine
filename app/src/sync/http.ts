import { SyncError, type SyncErrorCode, type SyncResponse, type SyncTransport } from './engine';

const MESSAGES: Record<SyncErrorCode, string> = {
  OFFLINE: 'Sem conexão com o servidor. Tudo continua salvo neste aparelho.',
  UNAUTHENTICATED: 'O servidor não reconheceu esta chave. Ela pode ter sido apagada em outro aparelho.',
  CURSOR_AHEAD: 'O servidor voltou de um backup. Reenviando os dados deste aparelho.',
  QUOTA_EXCEEDED: 'O espaço do seu cofre no servidor acabou.',
  RATE_LIMITED: 'Muitas sincronizações seguidas. Tente de novo em alguns minutos.',
  VAULT_MISMATCH: 'Conflito de chave no servidor. Gere uma nova chave.',
  SERVER: 'O servidor não respondeu como esperado. Tente mais tarde.',
};

export function syncMessage(code: SyncErrorCode): string {
  return MESSAGES[code];
}

/** Transporte HTTP para a API do servidor do StudyRoutine (server/). */
export function httpTransport(baseUrl: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): SyncTransport {
  const base = baseUrl.replace(/\/$/, '');

  async function call(method: string, path: string, token: string, body?: unknown): Promise<Response> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new SyncError('OFFLINE', MESSAGES.OFFLINE);
    }
    if (res.ok) return res;
    let code: SyncErrorCode = 'SERVER';
    try {
      const data = await res.json();
      if (data?.error && data.error in MESSAGES) code = data.error;
      else if (res.status === 401) code = 'UNAUTHENTICATED';
      else if (res.status === 413) code = 'QUOTA_EXCEEDED';
      else if (res.status === 429) code = 'RATE_LIMITED';
    } catch {
      if (res.status === 401) code = 'UNAUTHENTICATED';
    }
    throw new SyncError(code, MESSAGES[code]);
  }

  return {
    async createVault(vaultId, token) {
      await call('POST', '/api/v1/vaults', token, { vaultId });
    },
    async sync(token, since, changes) {
      const res = await call('POST', '/api/v1/sync', token, { since, changes });
      return (await res.json()) as SyncResponse;
    },
    async deleteVault(token) {
      await call('DELETE', '/api/v1/vault', token);
    },
  };
}
