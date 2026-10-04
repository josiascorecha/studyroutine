# Seção "Segurança dos dados" (Google Play)

Respostas propostas, a conferir na época do envio.

## Coleta e compartilhamento

**O app coleta ou compartilha algum dos tipos de dados do usuário exigidos?** Não.

Fundamentos:

1. Os registros ficam no aparelho e não são transmitidos ao desenvolvedor.
2. Com a sincronização ligada, os registros saem do aparelho já cifrados de ponta a ponta (AES-256-GCM) com uma chave que só os aparelhos da pessoa conhecem. A ajuda da Play diz que dados cifrados de ponta a ponta, que ficam ilegíveis para qualquer pessoa além do remetente e do destinatário, não precisam ser declarados como coletados.
3. O servidor não recebe nome, e-mail, telefone, identificadores de publicidade ou do aparelho, localização, contatos nem arquivos.
4. O IP da conexão é usado só para limitar abusos, transformado em código irreversível (HMAC) e apagado em até 2 dias. Logs técnicos não guardam IP.
5. Sem SDKs de análise, anúncios ou falhas.

## Práticas de segurança

| Pergunta | Resposta |
|---|---|
| Os dados são criptografados em trânsito? | Sim (HTTPS; além disso, cifrados de ponta a ponta) |
| O usuário pode pedir a exclusão dos dados? | Sim: no app (Ajustes › Sincronizar aparelhos › Apagar dados do servidor) e em `https://studyroutine.j2bot.com.br/excluir-dados` |
| Segue a política Famílias? | Não se aplica (público 13+) |
| Avaliação de segurança independente | Não |

## Se a revisão discordar

Se a Play entender que a sincronização precisa ser declarada, a declaração mais próxima seria: "Outros conteúdos gerados pelo usuário" e "Crenças religiosas ou políticas", **coletados, opcionais, não compartilhados, criptografados em trânsito, com exclusão disponível**, finalidade "Funcionalidade do app". Nunca "Análise", "Publicidade" ou "Personalização".
