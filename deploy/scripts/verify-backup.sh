#!/usr/bin/env bash
# Verificação de restauração: restaura um dump em um banco TEMPORÁRIO e compara
# a contagem de linhas das tabelas com o banco de origem. Não altera produção (só lê).
#
# Na VPS (pasta deploy/):   bash scripts/verify-backup.sh [arquivo.dump]
# Local (sem Docker):       PGHOST=... PGUSER=... PGPASSWORD=... PGDATABASE=... LOCAL=1 bash scripts/verify-backup.sh arquivo.dump
set -euo pipefail
cd "$(dirname "$0")/.."
DUMP="${1:-$(ls -1t backups/studyroutine-*.dump 2>/dev/null | head -1 || true)}"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "Nenhum dump encontrado." >&2; exit 1; }
if [ -f "$DUMP.sha256" ]; then
  (cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256" >/dev/null) || { echo "Checksum inválido: $DUMP" >&2; exit 1; }
fi
TABLES="vaults records schema_migrations"
TMPDB="studyroutine_verify_$(date +%s)"

if [ "${LOCAL:-0}" = "1" ]; then
  psql_src() { psql -X -At -v ON_ERROR_STOP=1 "$@"; }
  psql_tmp() { psql -X -At -v ON_ERROR_STOP=1 -d "$TMPDB" "$@"; }
  createdb "$TMPDB"
  trap 'dropdb --if-exists "$TMPDB"' EXIT
  pg_restore --no-owner --no-privileges -d "$TMPDB" "$DUMP"
else
  DC="docker compose --env-file .env"
  psql_src() { $DC exec -T db psql -X -At -v ON_ERROR_STOP=1 -U studyroutine -d studyroutine "$@"; }
  psql_tmp() { $DC exec -T db psql -X -At -v ON_ERROR_STOP=1 -U studyroutine -d "$TMPDB" "$@"; }
  $DC exec -T db createdb -U studyroutine "$TMPDB"
  trap '$DC exec -T db dropdb -U studyroutine --if-exists "$TMPDB"' EXIT
  $DC exec -T db pg_restore --no-owner --no-privileges -U studyroutine -d "$TMPDB" < "$DUMP"
fi

echo "Dump: $DUMP"
printf '%-18s %10s %10s\n' tabela backup atual
status=0
for t in $TABLES; do
  a=$(psql_tmp -c "SELECT count(*) FROM $t")
  b=$(psql_src -c "SELECT count(*) FROM $t")
  printf '%-18s %10s %10s\n' "$t" "$a" "$b"
  [ "$a" -gt 0 ] || [ "$b" -eq 0 ] || status=2
done
# Consistência interna: contadores de cada cofre batem com os registros guardados.
bad=$(psql_tmp -c "SELECT count(*) FROM vaults v WHERE v.records <> (SELECT count(*) FROM records r WHERE r.vault_id = v.id)")
echo "cofres com contador divergente no backup: $bad"
[ "$bad" = "0" ] || status=3
if [ $status -eq 0 ]; then echo "RESTAURAÇÃO VERIFICADA: o dump restaura e está consistente."; else echo "ATENÇÃO: verifique as linhas acima." >&2; fi
exit $status
