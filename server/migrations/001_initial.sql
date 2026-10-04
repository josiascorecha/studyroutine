-- StudyRoutine: cofres cifrados de ponta a ponta.
-- O servidor nunca recebe a chave: guarda só blobs opacos, o SHA-256 do token
-- de acesso e contadores de uso. Datas guardadas com precisão de dia, para
-- reduzir metadados sobre os hábitos de cada pessoa.

CREATE TABLE vaults (
  id            bytea PRIMARY KEY CHECK (octet_length(id) = 16),
  auth_hash     bytea NOT NULL UNIQUE CHECK (octet_length(auth_hash) = 32),
  seq           bigint NOT NULL DEFAULT 0 CHECK (seq >= 0),
  records       integer NOT NULL DEFAULT 0 CHECK (records >= 0),
  bytes         bigint NOT NULL DEFAULT 0 CHECK (bytes >= 0),
  created_on    date NOT NULL DEFAULT current_date,
  last_seen_at  timestamptz NOT NULL DEFAULT date_trunc('day', now())
);

CREATE TABLE records (
  vault_id   bytea NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  record_id  uuid NOT NULL,
  seq        bigint NOT NULL,
  blob       bytea NOT NULL,
  PRIMARY KEY (vault_id, record_id)
);
CREATE INDEX records_vault_seq ON records (vault_id, seq);

CREATE TABLE rate_limits (
  bucket        text NOT NULL,
  window_start  timestamptz NOT NULL,
  hits          integer NOT NULL,
  PRIMARY KEY (bucket, window_start)
);
