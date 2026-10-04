# StudyRoutine

Aplicativo gratuito para manter em dia a rotina espiritual: texto diário, leitura semanal da Bíblia até a reunião de meio de semana, preparo das reuniões, estudo pessoal e adoração em família, e ministério (participação, horas de pioneiro, estudos bíblicos e relatório).

O app **não reproduz conteúdo**: ele organiza a rotina e abre cada leitura nas fontes oficiais (jw.org, Biblioteca On-line, JW Library), toca o áudio oficial baixado na hora e mostra o comando certo da skill oficial da Alexa. Veja [docs/fontes-oficiais.md](docs/fontes-oficiais.md).

App independente, sem vínculo com a organização que mantém o jw.org. Sem anúncios, sem plano pago, sem cadastro.

## Como funciona

- **Local primeiro.** Tudo o que a pessoa registra fica no aparelho (IndexedDB). O app funciona sem internet, exceto para abrir links e tocar áudio.
- **Sincronização opcional e cifrada de ponta a ponta.** Com uma chave de recuperação de 28 caracteres, os registros são cifrados no aparelho (AES-256-GCM) e enviados ao servidor, que guarda só blobs ilegíveis. Detalhes em [docs/sincronizacao.md](docs/sincronizacao.md).
- **Servidor pequeno e próprio.** Fastify + PostgreSQL em Docker, projeto isolado na VPS. Serve a versão web, a API de sincronização e o catálogo curado de links do jw.org.

## Estrutura

```
app/        React 19 + Vite + Capacitor 8 (web e Android)
  src/domain/   regras puras: datas, Bíblia, plano de leitura, reuniões, ministério, links
  src/data/     IndexedDB (registros, metadados, cache)
  src/sync/     criptografia (WebCrypto), relógio lógico (HLC), motor de sincronização
  src/audio/    metadados e tocador do áudio oficial
  src/app/      modelo, serviços, catálogo, sincronização automática
  src/ui/       telas e componentes
  android/      projeto nativo gerado pelo Capacitor (ícones e assinatura ajustados)
  e2e/          testes Playwright (celular e computador)
server/     Node 22 + TypeScript + Fastify 5 + Zod + pg
  migrations/   SQL
  catalog/      catálogo curado (só links oficiais + descrições próprias)
deploy/     Docker Compose do projeto "studyroutine", scripts de deploy, backup e restauração
docs/       arquitetura, sincronização, fontes, privacidade, VPS, Google Play
scripts/    verificações do repositório (segredos, backup/restauração)
Dockerfile  imagem única: API + versão web
```

## Desenvolvimento

Requisitos: Node 22 e PostgreSQL 16 local.

```bash
# Banco de desenvolvimento
createuser -P studyroutine            # senha: devpass (só local)
createdb -O studyroutine studyroutine_dev
createdb -O studyroutine studyroutine_test

# Servidor (porta 3000)
cd server
npm ci
DATABASE_URL=postgres://studyroutine:devpass@localhost:5432/studyroutine_dev \
IP_PEPPER=pepper-de-desenvolvimento-com-mais-de-32-chars \
npm run dev

# App (porta 5173, com proxy de /api para o servidor)
cd app
npm ci
VITE_ALLOW_DATE_OVERRIDE=1 npm run dev   # permite simular a data com ?hoje=AAAA-MM-DD
```

### Testes

```bash
cd server && npm run typecheck && npm test        # API, cofres, cotas, limites (PostgreSQL de teste)
cd app && npm run typecheck && npm test           # domínio, plano de leitura, criptografia, sincronização, catálogo
bash scripts/check-public.sh                      # nada de segredos, backups ou e-mails reais no Git
PGHOST=localhost PGUSER=studyroutine PGPASSWORD=devpass bash scripts/test-backup-restore.sh

# Ponta a ponta: build de teste servido pelo próprio servidor
cd app && VITE_ALLOW_DATE_OVERRIDE=1 npm run build
cd ../server && npm run build && STATIC_DIR=../app/dist DATABASE_URL=... IP_PEPPER=... node dist/server.js &
cd ../app && npx playwright test
```

Os testes ponta a ponta simulam o serviço de metadados e os MP3 oficiais: nenhuma chamada sai para o jw.org.

### Android

```bash
cd app
cp .env.example .env            # VITE_SYNC_ORIGIN=https://studyroutine.j2bot.com.br
npm run build && npx cap sync android
npx cap open android            # Android Studio
node scripts/gerar-icones.mjs   # só se mudar os SVG em app/resources/
```

Passo a passo de assinatura e publicação em [docs/android-google-play.md](docs/android-google-play.md).

## Produção

Projeto Docker próprio (`studyroutine`): containers, rede, volume e backups só dele, sem depender de nenhum outro sistema da VPS. Guia em [docs/implantacao-vps.md](docs/implantacao-vps.md).

```bash
cd deploy
cp .env.example .env    # preencher
bash scripts/deploy.sh       # backup, build, subida e verificação de saúde com rollback automático
```

## Documentação

- [Arquitetura](docs/arquitetura.md)
- [Sincronização cifrada](docs/sincronizacao.md)
- [Fontes oficiais, termos de uso e Alexa](docs/fontes-oficiais.md)
- [Privacidade e retenção](docs/privacidade-e-retencao.md)
- [Implantação na VPS](docs/implantacao-vps.md)
- [Android e Google Play](docs/android-google-play.md) · [Segurança dos dados](docs/play-store/seguranca-dos-dados.md) · [Ficha da loja](docs/play-store/ficha-da-loja.md)
- [Avisos de terceiros](THIRD_PARTY_NOTICES.md)

## Licença

Ainda não definida. Até lá, todos os direitos reservados ao autor.
