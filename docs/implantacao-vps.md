# Implantação na VPS

O StudyRoutine roda como um projeto Docker Compose próprio (`studyroutine`). Ele não usa nem altera containers, redes, volumes ou bancos de outros sistemas da VPS e pode ser parado ou removido sem afetá-los.

| Recurso | Nome |
|---|---|
| Containers | `studyroutine-db`, `studyroutine-app`, `studyroutine-backup` |
| Rede | `studyroutine_internal` |
| Volume do banco | `studyroutine_pgdata` |
| Imagem | `studyroutine-app:latest` (e `:previous` para rollback) |
| Porta | `127.0.0.1:8088` (só local; o proxy reverso publica o subdomínio) |
| Backups | `deploy/backups/` |

## 1. Inspeção (somente leitura)

Na VPS:

```bash
bash deploy/scripts/inspect-vps.sh studyroutine.j2bot.com.br 8088 > inspecao.txt
```

Confira: porta 8088 livre, nomes `studyroutine-*` livres, qual proxy reverso está em uso (Nginx, Caddy ou Traefik) e se o DNS do subdomínio já aponta para a VPS. Se a porta estiver ocupada, escolha outra e use a mesma no `.env` e no proxy.

## 2. DNS

Registro `A` (e `AAAA`, se houver IPv6) de `studyroutine.j2bot.com.br` para o IP da VPS.

## 3 e 4. Código, configuração e subida

Forma rápida (primeira vez), que gera o `.env` com segredos aleatórios e já roda o deploy:

```bash
sudo git clone https://github.com/josiascorecha/studyroutine.git /opt/studyroutine
cd /opt/studyroutine/deploy
sudo bash scripts/primeira-instalacao.sh studyroutine.j2bot.com.br contato@exemplo.com.br
```

O script confere Docker, porta livre e nomes livres antes de criar qualquer coisa, e não faz nada se o `.env` já existir.

Forma manual:

```bash
cd /opt/studyroutine/deploy
cp .env.example .env
openssl rand -hex 32         # use para POSTGRES_PASSWORD
openssl rand -hex 32         # use para IP_PEPPER
nano .env                    # APP_ORIGIN=https://studyroutine.j2bot.com.br, CONTACT_EMAIL, segredos
chmod 600 .env
bash scripts/deploy.sh
```

O `deploy.sh` recusa subir enquanto houver valores de exemplo no `.env`. Ele guarda a imagem atual para rollback, faz backup antes de atualizar (a partir do segundo deploy), constrói a imagem, sobe os serviços e verifica `http://127.0.0.1:8088/api/health`. Se a saúde falhar, volta para a imagem anterior.

## 5. Proxy reverso e HTTPS

Use o arquivo do proxy que a inspeção encontrou:

- Nginx: `deploy/proxy/nginx-studyroutine.conf` → `/etc/nginx/sites-available/studyroutine`, link em `sites-enabled`, `nginx -t && systemctl reload nginx`, depois `certbot --nginx -d studyroutine.j2bot.com.br`.
- Caddy: acrescente `deploy/proxy/Caddyfile.snippet` ao Caddyfile e `caddy reload`.
- Traefik em container: `docker compose --env-file .env -f docker-compose.yml -f proxy/docker-compose.traefik.yml up -d` (ajuste a rede e o certresolver).

Os arquivos deixam o log de acesso desligado para este subdomínio, coerente com a política de privacidade.

## 6. Conferência

```bash
curl -fsS https://studyroutine.j2bot.com.br/api/health          # {"ok":true}
curl -sI https://studyroutine.j2bot.com.br/ | grep -i content-security-policy
docker compose --env-file .env ps
docker compose --env-file .env logs --tail 20 backup
```

Abra o endereço no navegador, ative a sincronização em Ajustes e pareie um segundo navegador com a chave.

## Atualizações

```bash
cd /opt/studyroutine && git pull && cd deploy && bash scripts/deploy.sh
```

## Backups

- Automático: um `pg_dump` por dia às `BACKUP_HOUR` (padrão 3h, horário de Brasília), guardado por `BACKUP_KEEP_DAYS` (padrão 30), com checksum SHA-256.
- Manual: `bash scripts/backup-now.sh`.
- Verificar se um backup restaura, sem tocar em produção: `bash scripts/verify-backup.sh [arquivo]`.
- Copie `deploy/backups/` para fora da VPS periodicamente. Os dados dos cofres continuam cifrados no dump.

## Restauração e rollback

- Voltar a versão do app: `bash scripts/rollback.sh`.
- Restaurar o banco: `bash scripts/restore.sh backups/studyroutine-AAAAMMDD-HHMMSS.dump` (pede confirmação, faz backup do estado atual e mantém o banco anterior como `studyroutine_old`).
- Depois de restaurar um backup antigo, os aparelhos percebem que o servidor "voltou no tempo" e reenviam o que tiverem.

## Remover tudo

```bash
cd /opt/studyroutine/deploy
docker compose --env-file .env down          # para e remove containers e rede
docker volume rm studyroutine_pgdata         # APAGA o banco (faça backup antes)
docker image rm studyroutine-app:latest studyroutine-app:previous
```

Nenhum outro projeto da VPS é afetado.

## Recursos

O serviço é pequeno: a API usou cerca de 85 MB de RAM nos testes; o PostgreSQL fica no padrão da imagem alpine. Cada registro ocupa algumas centenas de bytes cifrados, então um cofre de uso pessoal fica em geral abaixo de 1 MB.
