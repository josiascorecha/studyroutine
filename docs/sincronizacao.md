# Sincronização cifrada

Objetivo: usar o mesmo StudyRoutine em mais de um aparelho sem que o servidor consiga ler, identificar ou datar o que a pessoa registra.

## Chave de recuperação

- 28 caracteres do alfabeto `ABCDEFGHJKMNPQRSTVWXYZ23456789` (sem 0/O, 1/I/L e U), ≈ 137 bits, gerada no aparelho com `crypto.getRandomValues` e amostragem por rejeição (sem viés).
- Exibida em 7 grupos de 4 (`XXXX-XXXX-…`). Ao digitar, o app aceita minúsculas, espaços e hifens.
- Na ativação, a pessoa confirma os 4 últimos caracteres. A chave pode ser vista de novo em Ajustes para parear outro aparelho.
- Sem a chave e sem um aparelho pareado, os dados do servidor são irrecuperáveis, por desenho.

## Derivação (HKDF-SHA256, WebCrypto)

Entrada: a chave normalizada sem hifens. Sal: `studyroutine-v1`.

| `info` | Tamanho | Uso |
|---|---|---|
| `vault-id` | 128 bits | Identificador público do cofre |
| `auth-token` | 256 bits | Token `Bearer`; o servidor guarda só o SHA-256 |
| `record-encryption` | 256 bits | Chave AES-256-GCM dos registros |
| `record-ids` | 256 bits | Chave HMAC-SHA256 dos identificadores |

Como as quatro saem da mesma chave, qualquer aparelho com a chave chega ao mesmo cofre sem trocar nada com o servidor.

## Registro no servidor

- **Identificador:** `HMAC(record-ids, "tipo:chave")`, truncado em 128 bits e formatado como UUID versão 8. É igual em todos os aparelhos e não revela tipo nem data (ex.: a leitura de 2/10 não aparece como data).
- **Conteúdo:** JSON `{t, k, d, h, x}` (tipo, chave, dados, relógio lógico, lápide) → preenchido até múltiplo de 256 bytes (prefixo de 4 bytes com o tamanho real) → AES-256-GCM com IV aleatório de 96 bits e dados adicionais `sr1:{idDoCofre}:{idDoRegistro}`.
- **Blob:** `versão (1 byte) | IV (12) | texto cifrado + tag`, em base64url.
- O dado adicional impede que o servidor troque blobs de lugar (entre registros ou entre cofres) sem ser percebido. Ao decifrar, o app ainda confere se o tipo e a chave de dentro do blob geram o mesmo identificador.

## Protocolo

`POST /api/v1/sync` com `{ since, changes: [{id, blob}] }`:

1. O servidor trava o cofre (`SELECT … FOR UPDATE`), confere cotas, grava as alterações com um número de sequência por cofre (`seq`) e devolve `{ seq, more, changes }` com tudo o que mudou depois de `since` (paginado).
2. O aparelho aplica o que chegou, marca como limpo o que enviou e guarda o novo cursor.
3. Lotes de até 200 registros ou ~1,5 MB.

### Conflitos

Último a escrever vence, por registro, pelo relógio lógico híbrido (`ms-contador-nó`). Como quase tudo é evento com chave própria (uma leitura por dia, uma saída por UUID), conflitos reais são raros. Exclusões viram lápides para propagar entre aparelhos.

### Casos especiais

| Situação | Comportamento |
|---|---|
| Servidor restaurado de um backup antigo (`since` > `seq`) | Resposta `CURSOR_AHEAD`: o app zera o cursor, marca tudo como pendente e reenvia. |
| Parear um aparelho novo | Antes de enviar qualquer coisa, baixa o cofre e força a configuração vinda do cofre (para os ajustes do aparelho novo não sobrescreverem os do antigo). |
| Cofre apagado em outro aparelho ou na página `/excluir-dados` | `401`: o app mostra em Ajustes "O servidor não reconheceu esta chave". Os dados do aparelho continuam; a pessoa pode desligar a sincronização ou ativar com uma chave nova. |
| Cota atingida | `413 QUOTA_EXCEEDED`, com mensagem clara; nada é perdido no aparelho. |
| Sem rede | O app continua normalmente; sincroniza quando a conexão volta. |

### Quando sincroniza

Com a sincronização ligada: 4 s depois de uma alteração, ao voltar a conexão, ao voltar o app para o primeiro plano e a cada 15 minutos enquanto aberto. Também há o botão "Sincronizar agora".

## O que o servidor sabe

| Sabe | Não sabe |
|---|---|
| Que existe um cofre, quantos registros e bytes ele tem | Quem é a pessoa (sem e-mail, nome ou conta) |
| O dia em que foi criado e o último dia em que sincronizou | Tipo, data ou conteúdo de qualquer registro |
| O IP de cada conexão, no momento da conexão (guardado só como HMAC por até 2 dias, para limites de abuso) | A chave de recuperação ou as chaves derivadas |

## Limites padrão

20 MB ou 50 mil registros por cofre; 64 KB por registro; 10 cofres novos por IP por dia; 60 falhas de autenticação por IP em 15 minutos; cofres sem sincronizar há 548 dias (18 meses) são apagados. Todos configuráveis no `.env`.
