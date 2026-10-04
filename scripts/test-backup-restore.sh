#!/usr/bin/env bash
# Teste automatizado de backup e restauração (sem Docker), usando os scripts reais de deploy/.
# Requer PostgreSQL local, o servidor compilado (server/dist) e um usuário com CREATEDB. Ex.:
#   PGHOST=localhost PGUSER=studyroutine PGPASSWORD=... scripts/test-backup-restore.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
SRC="sr_bk_src_$$"; DST="sr_bk_dst_$$"
PORT="${TEST_PORT:-3199}"
SERVER_PID=""
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null; dropdb --if-exists "$SRC"; dropdb --if-exists "$DST"; rm -rf "$WORK"; }
trap cleanup EXIT
createdb "$SRC"

# 1. Sobe o servidor e grava dois cofres pela API (como os aparelhos fariam).
DATABASE_URL="postgres://${PGUSER}:${PGPASSWORD}@${PGHOST:-localhost}:${PGPORT:-5432}/$SRC" \
  IP_PEPPER="teste-backup-pepper-0123456789abcdefghij" PORT="$PORT" HOST=127.0.0.1 LOG_LEVEL=warn \
  node "$ROOT/server/dist/server.js" > "$WORK/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break; sleep 0.5; done
node --input-type=module - "$PORT" <<'JS'
import { randomBytes } from 'node:crypto';
const port = process.argv[2];
const b64 = (b) => Buffer.from(b).toString('base64url');
for (let v = 0; v < 2; v++) {
  const vaultId = randomBytes(16), token = randomBytes(32);
  const h = { 'content-type': 'application/json', authorization: `Bearer ${b64(token)}` };
  let r = await fetch(`http://127.0.0.1:${port}/api/v1/vaults`, { method: 'POST', headers: h, body: JSON.stringify({ vaultId: b64(vaultId) }) });
  if (!r.ok) throw new Error(`criar cofre: ${r.status} ${await r.text()}`);
  const records = Array.from({ length: 25 }, () => {
    const id = randomBytes(16); id[6] = (id[6] & 0x0f) | 0x80; id[8] = (id[8] & 0x3f) | 0x80;
    const hex = id.toString('hex');
    return { id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`, blob: b64(Buffer.concat([Buffer.from([1]), randomBytes(12 + 256 + 16)])) };
  });
  r = await fetch(`http://127.0.0.1:${port}/api/v1/sync`, { method: 'POST', headers: h, body: JSON.stringify({ since: 0, changes: records }) });
  if (!r.ok) throw new Error(`sincronizar: ${r.status} ${await r.text()}`);
}
JS
before=$(psql -X -At -d "$SRC" -c "SELECT (SELECT count(*) FROM vaults)||'/'||(SELECT count(*) FROM records)||'/'||(SELECT md5(string_agg(encode(blob,'hex'), '' ORDER BY record_id)) FROM records)")
kill "$SERVER_PID"; SERVER_PID=""

# 2. Backup com o mesmo script do container de backup.
PGDATABASE="$SRC" BACKUP_DIR="$WORK" sh "$ROOT/deploy/scripts/backup-loop.sh" --once >/dev/null
DUMP=$(ls -1 "$WORK"/studyroutine-*.dump | head -1)
(cd "$WORK" && sha256sum -c "$(basename "$DUMP").sha256" >/dev/null)

# 3. Perda total do banco e restauração em outro.
dropdb "$SRC"
createdb "$DST"
pg_restore --no-owner --no-privileges -d "$DST" "$DUMP"
after=$(psql -X -At -d "$DST" -c "SELECT (SELECT count(*) FROM vaults)||'/'||(SELECT count(*) FROM records)||'/'||(SELECT md5(string_agg(encode(blob,'hex'), '' ORDER BY record_id)) FROM records)")

# 4. Verificação com o script de conferência (modo local).
cp "$DUMP" "$DUMP.sha256" "$WORK/" 2>/dev/null || true
PGDATABASE="$DST" LOCAL=1 bash "$ROOT/deploy/scripts/verify-backup.sh" "$DUMP" >/dev/null

echo "antes:  $before"
echo "depois: $after   (cofres/registros/md5 dos blobs)"
[ "$before" = "$after" ] && echo "OK: backup restaurado com os mesmos dados cifrados." || { echo "FALHOU" >&2; exit 1; }
