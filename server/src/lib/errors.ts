export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, code = 'BAD_REQUEST') => new HttpError(400, code, msg);
export const unauthorized = (msg = 'Chave de sincronização não reconhecida.') => new HttpError(401, 'UNAUTHENTICATED', msg);
export const conflict = (msg: string, code = 'CONFLICT') => new HttpError(409, code, msg);
export const quota = (msg = 'O cofre atingiu o limite de armazenamento.') => new HttpError(413, 'QUOTA_EXCEEDED', msg);
export const tooMany = (msg = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.') =>
  new HttpError(429, 'RATE_LIMITED', msg);
