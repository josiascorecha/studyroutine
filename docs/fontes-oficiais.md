# Fontes oficiais, termos de uso e Alexa

Regra do projeto: todo conteúdo vem do jw.org e subdomínios, aberto ou tocado nas próprias fontes. O app guarda só a rotina da pessoa, links e as anotações dela.

## Termos de Uso do jw.org

Fonte: https://www.jw.org/pt/termos-de-uso/ (conferido em 02/10/2026). Trechos que orientam o desenho:

- Permitido: "Visualizar, baixar e imprimir fotos e gravuras de direito autoral da Watch Tower, músicas, publicações eletrônicas, textos e vídeos deste site para uso pessoal e não comercial."
- Não permitido: "Distribuir fotos, gravuras, publicações eletrônicas, marcas registradas, músicas, textos ou vídeos deste site como parte de qualquer software ou aplicativo."
- Não permitido: "Criar, com o objetivo de distribuir, qualquer software, aplicativo, ferramenta ou técnica que sirva especificamente para colecionar, copiar, baixar, extrair ou rastrear dados, HTML, imagens ou textos deste site. (Isso não proíbe a distribuição gratuita, sem fins comerciais, de aplicativos projetados para baixar arquivos eletrônicos como EPUB, PDF, MP3 e arquivos MP4 das áreas públicas deste site.)"

Consequências no código e na publicação:

| Regra | Como o app cumpre |
|---|---|
| Nada de conteúdo embutido | O pacote não tem textos, imagens, áudios nem marcas do jw.org. O catálogo tem só títulos, links e descrições escritas pelo mantenedor. |
| Nada de raspagem | O app não lê páginas HTML. A leitura da semana é informada pela pessoa (com sugestão da continuação). |
| Áudio só baixado na hora, das áreas públicas | O tocador usa a URL oficial do MP3 obtida no serviço de metadados de download; o arquivo não é redistribuído. |
| Gratuito e não comercial | Sem anúncios, sem plano pago, sem doações dentro do app. |
| Sem marcas | Nome e ícone neutros. A ficha da loja diz que o app é independente. |
| Só links oficiais | `isOfficialUrl` aceita apenas `https://jw.org` e subdomínios `*.jw.org`, no app e no servidor (catálogo e links salvos). |

## Links usados (conferidos em 02/10/2026)

| Uso | Padrão |
|---|---|
| Texto diário | `https://www.jw.org/finder?wtlocale=T&alias=daily-text&date=AAAAMMDD` |
| Programação das reuniões da semana | `https://www.jw.org/finder?wtlocale=T&alias=meetings&date=AAAAMMDD` (o próprio jw.org resolve a semana) |
| Trecho bíblico | `https://www.jw.org/finder?wtlocale=T&prefer=lang&pub=nwtsty&bible=LCCCVVV-LCCCVVV` (livro sem zero à esquerda, capítulo e versículo com 3 dígitos; `24040001` = Jeremias 40:1) |
| Capítulo na Biblioteca On-line | `https://wol.jw.org/pt/wol/b/r5/lp-t/nwtsty/LIVRO/CAP` |
| Artigo na Biblioteca On-line | `https://wol.jw.org/pt/wol/d/r5/lp-t/DOCID` |
| Publicação | `https://wol.jw.org/pt/wol/publication/r5/lp-t/SIMBOLO` (`lmd`, `lff`, `th`) |
| Pesquisa | `https://wol.jw.org/pt/wol/s/r5/lp-t?q=TERMO` |

Se algum formato mudar, os pontos de troca estão em `app/src/domain/links.ts`.

## Metadados de áudio

Serviço usado pela página de download do jw.org (não documentado publicamente):

```
https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?output=json&pub=nwt&fileformat=MP3&alllangs=0&langwritten=T&txtCMSLang=T&booknum=24&track=40
https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?output=json&pub=w&issue=202607&fileformat=MP3&alllangs=0&langwritten=T&txtCMSLang=T
```

- Capítulo: `files.T.MP3[0]` traz `file.url` (em `*.jw-cdn.org`), `duration` e `markers.markers[]` com `verseNumber` e `startTime` (`hh:mm:ss.mmm`). Alguns capítulos não têm marcador para todos os versículos (ex.: Jeremias 39:12); o app interpola.
- A Sentinela: cada artigo de estudo traz no título a semana entre parênteses, ex.: "Ajude outros a conhecer a Jeová (28 de setembro—4 de outubro)". O app associa semana → artigo por esse título, sem abrir páginas. Procura nas edições de 1 a 3 meses antes da semana.
- O app só aceita URLs de áudio `https://*.jw-cdn.org`. Em caso de falha, oferece Abrir e o comando da Alexa.

## Alexa (skill oficial do JW.ORG)

- Skill: https://www.amazon.com.br/dp/B07YSRTQ27 (desenvolvedor Watch Tower Bible and Tract Society of Pennsylvania). Há skills não oficiais com nomes parecidos; o app aponta só para esta.
- Ajuda oficial: https://www.jw.org/pt/ajuda-online/como-usar-jw-org/skills-para-amazon-alexa/
- Comandos usados pelo app (texto oficial em português):
  - "Alexa, ler o texto diário de hoje do jw.org"
  - "Alexa, ler a leitura da Bíblia desta semana do jw.org" / "… da semana que vem do jw.org"
  - "Alexa, tocar Jeremias capítulo 40 do jw.org"
  - "Alexa, ler o estudo de A Sentinela desta semana do jw.org"
  - "Alexa, ler o estudo bíblico de congregação desta semana do jw.org"
  - "Alexa, leia a programação da Apostila da Reunião dessa semana do jw.org"
  - "Alexa, leia Seja Feliz para Sempre! lição 1 do jw.org"
- Para a Alexa, a semana começa na segunda-feira; o app escolhe "desta semana" ou "da semana que vem" conforme a data da reunião.
- O app não aciona a Alexa (não há meio oficial). Ele mostra o comando, ensina a criar uma Rotina da Alexa com a ação "Personalizado" e aceita "Ouvi pela Alexa" como tarefa feita.

## Relatório de serviço

Publicador informa participação no ministério e estudos bíblicos; horas só para pioneiros. O ano de serviço vai de setembro a agosto. O app não envia nada: gera o texto para a pessoa enviar pelo canal da congregação.

## Catálogo curado

`server/catalog/catalogo.json` (cópia embutida em `app/src/app/catalogo-inicial.json`; um teste garante que são iguais). Para incluir um item: título, descrição com palavras próprias (sem copiar texto da matéria), URL oficial conferida, temas, público e tipo. O servidor valida tudo na subida e recusa links fora do jw.org.
