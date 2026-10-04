# Privacidade e retenção

Rascunho técnico para apoiar a política de privacidade (página `/privacidade` do app). A política precisa de revisão jurídica antes da publicação.

## Contexto legal

- LGPD, art. 5º, II: convicção religiosa é dado pessoal sensível. Os registros do app (texto diário, reuniões, ministério) revelam essa convicção.
- LGPD, art. 4º, I: não se aplica ao tratamento feito por pessoa natural para fins exclusivamente particulares. Os dados que ficam só no aparelho estão nesse caso.
- Para a sincronização, o servidor guarda dados cifrados de ponta a ponta, sem identificação da pessoa e sem acesso ao conteúdo. Mesmo assim, há tratamento técnico (armazenamento, IP de conexão). Confirmar o enquadramento com revisão jurídica.

## O que existe em cada lugar

| Lugar | O que fica | Quem controla | Por quanto tempo |
|---|---|---|---|
| Aparelho (IndexedDB) | Todos os registros, ajustes, chave de sincronização, cache do áudio e do catálogo | A pessoa | Até ela apagar os dados do app ou desinstalar |
| Backup do Android (conta Google da pessoa) | Pode incluir os dados do app, conforme as configurações do celular | A pessoa e o Android | Regras do Google |
| Servidor: tabela `vaults` | Id do cofre, SHA-256 do token, contadores, dia de criação, último dia de uso | Mantenedor | Até a exclusão pela pessoa ou 548 dias sem uso |
| Servidor: tabela `records` | Blobs cifrados e ids opacos | Mantenedor (sem conseguir ler) | Igual ao cofre |
| Servidor: tabela `rate_limits` | HMAC do IP com segredo do servidor, contagem e janela | Mantenedor | Até 2 dias |
| Logs da aplicação (Docker) | Método, rota, código e tempo de resposta. Sem IP, sem cabeçalhos, sem corpo | Mantenedor | Rotação: 3 arquivos de 10 MB |
| Proxy reverso da VPS | Log de acesso desligado para este subdomínio (ver `deploy/proxy`) | Mantenedor | — |
| Backups do banco | Dump diário (dados continuam cifrados) | Mantenedor | 30 dias |

## O que o app não faz

Sem cadastro, e-mail, telefone ou senha; sem anúncios; sem ferramentas de análise ou rastreamento; sem SDKs de terceiros; sem localização; sem acesso a contatos ou arquivos.

Conexões que saem do aparelho: servidor do StudyRoutine (só com sincronização ligada, e para o catálogo), serviço de metadados de áudio e CDN do jw.org (ao preparar ou tocar áudio) e os links abertos pela pessoa.

## Direitos e exclusão

- No aparelho: apagar os dados do app nas configurações do Android ou desinstalar.
- No servidor: Ajustes › Sincronizar aparelhos › Apagar dados do servidor, ou a página pública `/excluir-dados` com a chave de recuperação (exigência da Google Play de um link na web).
- Como o servidor não identifica pessoas, não há como atender pedidos por nome ou e-mail; o atendimento é pela chave.

## Itens para revisar antes de publicar

1. Texto final da política com revisão jurídica (contato do controlador, base legal, transferência internacional se a VPS estiver fora do Brasil).
2. `CONTACT_EMAIL` real no `.env` da VPS.
3. Confirmar que o log de acesso do proxy está desligado (ou sem IP) para o subdomínio.
4. Confirmar o prazo de 548 dias de inatividade e informar na loja.
