#!/usr/bin/env bash
# Restaura um backup no banco de PRODUÇÃO (substitui os dados atuais).
# 1) faz um backup de segurança do estado atual; 2) para a aplicação;
# 3) recria o banco a partir do dump; 4) sobe a aplicação e checa a saúde.
# Atenção: aparelhos que sincronizaram depois do backup reenviam o que falta sozinhos
# (o app detecta que o servidor "voltou no tempo" e reenvia tudo).
set -euo pipefail
cd "$(dirname "$0")/.."
DUMP="${1:?uso: bash scripts/restore.sh backups/studyroutine-AAAAMMDD-HHMMSS.dump}"
[ -f "$DUMP" ] || { echo "Arquivo não encontrado: $DUMP" >&2; exit 1; }
if [ -f "$DUMP.sha256" ]; then (cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256"); fi
read -r -p "Isto SUBSTITUI os dados atuais por $DUMP. Digite RESTAURAR para continuar: " ok
[ "$ok" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
APP_PORT=$(grep -E '^APP_PORT=' .env | cut -d= -f2 || true)
DC="docker compose --env-file .env"
echo "Backup de segurança do estado atual…"
bash scripts/backup-now.sh
$DC stop app
$DC exec -T db psql -U studyroutine -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS studyroutine_old" -c "ALTER DATABASE studyroutine RENAME TO studyroutine_old" -c "CREATE DATABASE studyroutine OWNER studyroutine"
if ! $DC exec -T db pg_restore --no-owner --no-privileges -U studyroutine -d studyroutine < "$DUMP"; then
  echo "Falha ao restaurar; voltando ao banco anterior." >&2
  $DC exec -T db psql -U studyroutine -d postgres -c "DROP DATABASE studyroutine" -c "ALTER DATABASE studyroutine_old RENAME TO studyroutine"
  $DC start app
  exit 1
fi
$DC start app
sleep 5
curl -fsS "http://127.0.0.1:${APP_PORT:-8088}/api/health" && echo " — aplicação no ar."
echo "Banco anterior mantido como 'studyroutine_old'. Após conferir, remova com:"
echo "  $DC exec db psql -U studyroutine -d postgres -c 'DROP DATABASE studyroutine_old'"
