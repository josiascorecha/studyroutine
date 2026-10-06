#!/usr/bin/env bash
# Primeira instalação na VPS: cria deploy/.env com segredos aleatórios e sobe o StudyRoutine.
# Uso (na pasta deploy/):
#   bash scripts/primeira-instalacao.sh studyroutine.j2bot.com.br contato@exemplo.com.br [porta]
# Não mexe em nada fora do projeto "studyroutine". Se o .env já existir, não faz nada.
set -euo pipefail
cd "$(dirname "$0")/.."
DOMAIN="${1:?uso: bash scripts/primeira-instalacao.sh <dominio> <email-de-contato> [porta]}"
CONTACT="${2:?informe o e-mail de contato que aparece na política de privacidade}"
PORT="${3:-8088}"
[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || { echo "Domínio inválido: $DOMAIN" >&2; exit 1; }
[[ "$CONTACT" =~ ^[^@[:space:]|]+@[^@[:space:]|]+\.[a-z]{2,}$ ]] || { echo "E-mail inválido: $CONTACT" >&2; exit 1; }
[[ "$PORT" =~ ^[0-9]{4,5}$ ]] || { echo "Porta inválida: $PORT" >&2; exit 1; }
if [ -f .env ]; then echo "deploy/.env já existe; nada foi alterado. Para atualizar: bash scripts/deploy.sh" >&2; exit 1; fi
command -v docker >/dev/null || { echo "Docker não encontrado." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 não encontrado." >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl não encontrado." >&2; exit 1; }
if ss -tln 2>/dev/null | grep -q ":${PORT}\b"; then
  echo "A porta ${PORT} já está em uso. Escolha outra, ex.: bash scripts/primeira-instalacao.sh $DOMAIN $CONTACT 8090" >&2; exit 1
fi
for n in studyroutine-db studyroutine-app studyroutine-backup; do
  if docker ps -a --format '{{.Names}}' | grep -qx "$n"; then echo "Já existe o container $n. Use: bash scripts/deploy.sh" >&2; exit 1; fi
done

umask 077
sed -e "s|^APP_ORIGIN=.*|APP_ORIGIN=https://${DOMAIN}|" \
    -e "s|^APP_PORT=.*|APP_PORT=${PORT}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 32)|" \
    -e "s|^IP_PEPPER=.*|IP_PEPPER=$(openssl rand -hex 32)|" \
    -e "s|^CONTACT_EMAIL=.*|CONTACT_EMAIL=${CONTACT}|" \
    .env.example > .env
chmod 600 .env
echo "deploy/.env criado com segredos aleatórios (só o dono lê)."

bash scripts/deploy.sh

echo
echo "Falta o proxy reverso: https://${DOMAIN} -> 127.0.0.1:${PORT}"
echo "  Nginx: deploy/proxy/nginx-studyroutine.conf   Caddy: deploy/proxy/Caddyfile.snippet"
[ "$PORT" = "8088" ] || echo "  Atenção: troque 8088 por ${PORT} no arquivo do proxy."
