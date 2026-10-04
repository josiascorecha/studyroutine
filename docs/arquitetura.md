# Arquitetura

## Visão geral

```
Aparelho (Android ou navegador)                      VPS (projeto Docker "studyroutine")
┌──────────────────────────────────────┐            ┌─────────────────────────────────────┐
│ React 19 + Capacitor 8               │   HTTPS    │ Fastify 5 (Node 22)                  │
│  regras de domínio (puras, testadas) │ ─────────▶ │  /api/v1/vaults, /sync, /vault       │
│  IndexedDB: registros, meta, cache   │  cifrado   │  /api/v1/catalogo  /api/health       │
│  WebCrypto: AES-256-GCM, HKDF, HMAC  │            │  versão web (mesma origem)           │
│  notificações locais (Android)       │            │ PostgreSQL 16: cofres e blobs        │
└──────────────┬───────────────────────┘            └─────────────────────────────────────┘
               │ abre / toca
               ▼
   jw.org · wol.jw.org · JW Library · áudio oficial (b.jw-cdn.org → *.jw-cdn.org) · Alexa
```

O app é **local primeiro**: funciona sem conta e sem servidor. O servidor só existe para a sincronização opcional entre aparelhos, para servir a versão web e o catálogo de sugestões.

## App

### Camadas

| Pasta | Papel |
|---|---|
| `src/domain` | Regras puras, sem React nem I/O: datas locais (`DayKey` = `AAAA-MM-DD`), livros e versículos da Bíblia, janela de leitura até a reunião, divisão da leitura por dia, Alexa, ministério, A Sentinela, links oficiais. |
| `src/data` | IndexedDB com três áreas: `records` (dados da pessoa, sincronizáveis), `meta` (estado do aparelho: chave, cursor, cronômetro) e `cache` (metadados do áudio oficial e catálogo; nunca sincroniza). |
| `src/sync` | Criptografia, relógio lógico híbrido e motor de sincronização. Ver [sincronizacao.md](sincronizacao.md). |
| `src/audio` | Leitura dos metadados oficiais de download (URL do MP3, duração, marcadores de versículo) e tocador por trechos. |
| `src/app` | Modelo de registros, serviços (repo, áudio, sync, player), catálogo, derivação do "dia" que as telas mostram. |
| `src/ui` | Telas: Hoje, Leitura, Reuniões, Estudo, Ministério e Ajustes; páginas públicas `/privacidade` e `/excluir-dados`. |

### Registros

Cada registro tem `type`, `key`, `data`, `hlc` (relógio lógico), `deleted` (lápide) e `dirty` (pendente de envio). Tipos atuais:

| Tipo | Chave | Conteúdo |
|---|---|---|
| `config` | `main` | Ajustes: reuniões, prazo da leitura, modo de ministério, meta, tema, Alexa, lembretes, dia da adoração em família, temas de interesse |
| `semana` | segunda-feira da semana da reunião | Livro, capítulos e lições do "Ame as Pessoas" treinadas |
| `leitura` | `semana:data` | Evento "li do versículo X ao Y neste dia" e por qual meio (leitura, áudio, Alexa) |
| `texto` | data | Texto diário feito, meio e anotação |
| `sentinela` | semana | Total de parágrafos, parágrafos preparados, favoritos com comentário |
| `meio` | semana | Checklist da reunião de meio de semana |
| `designacao` | semana | Designação e tipo |
| `saida` | UUID | Saída de campo (data, minutos, modalidade) |
| `estudante` | UUID | Estudo bíblico (apelido, lição atual) |
| `familia` | data | Adoração em família (ideia usada, anotação) |
| `link` | UUID | Link do jw.org salvo pela pessoa |
| `visto` | id do catálogo | Sugestão marcada como vista |

O progresso da leitura é calculado a partir dos eventos, não de um contador: dois aparelhos nunca brigam por um número.

### Leitura da semana

1. A pessoa informa o dia e o horário das reuniões e o prazo (véspera ou dia da reunião).
2. A janela vai do dia seguinte à reunião anterior até o prazo; exceções (visita do superintendente, assembleia) mudam o dia daquela semana.
3. A pessoa cadastra o trecho da apostila (o app sugere a continuação da semana anterior).
4. O trecho vira unidades de versículo; a divisão por dia pode ser por capítulos, versículos ou minutos de áudio (com os marcadores oficiais).
5. A cada dia, o restante é redistribuído pelos dias que faltam. Dias antes da instalação não contam como atraso.
6. "Ouvir" toca exatamente a porção do dia, pulando de um capítulo para o outro pelos marcadores de versículo.

### Áudio e metadados oficiais

O app consulta o serviço de metadados que a página de download do jw.org usa (`b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS`) para obter o MP3, a duração e os marcadores de versículo de cada capítulo, e a lista de artigos de cada edição de A Sentinela (o título traz a semana de estudo). O resultado fica em cache no aparelho. O áudio em si é tocado direto dos servidores oficiais, nunca embutido no app.

Esse serviço não é uma API documentada: se ele mudar ou falhar, o app continua funcionando com links e comandos da Alexa.

### Notificações (Android)

Lembretes locais, sem servidor e sem push: texto diário, leitura e véspera das reuniões. Sem alarme exato (a permissão `SCHEDULE_EXACT_ALARM` é removida do manifesto), o Android entrega no horário aproximado.

### Links externos

No Android, os links passam pelo sistema (`@capacitor/app-launcher`): o JW Library abre quando estiver instalado e associado aos links do jw.org; senão, o navegador.

## Servidor

| Rota | Função |
|---|---|
| `GET /api/health` | Saúde (usada pelo Docker e pelo deploy) |
| `GET /api/v1/info` | Versão da política, contato, limites |
| `GET /api/v1/catalogo` | Catálogo curado (cache de 1 hora) |
| `POST /api/v1/vaults` | Cria o cofre (idempotente) |
| `GET /api/v1/vault` | Situação do cofre (registros, bytes, cursor) |
| `POST /api/v1/sync` | Envia alterações e recebe o que mudou desde o cursor, numa ida e volta |
| `DELETE /api/v1/vault` | Apaga o cofre e tudo nele |

Proteções: autenticação por `Authorization: Bearer` (sem cookies, então sem CSRF), CORS só para a origem do app e do Capacitor, limites de criação de cofres por IP (IP guardado como HMAC por até 2 dias), bloqueio após falhas de autenticação, cotas por cofre, CSP e cabeçalhos de segurança, logs só com método e rota, cofres inativos apagados após 18 meses.

Banco: `vaults`, `records`, `rate_limits`, `schema_migrations`. Migrações SQL aplicadas na subida com trava consultiva.

## Independência

O StudyRoutine não importa código, não lê o banco e não usa containers, redes ou volumes de outros projetos da VPS. Os padrões de implantação (Dockerfile multi-stage, compose endurecido, backup diário, scripts com rollback) foram reescritos aqui com nomes próprios.
