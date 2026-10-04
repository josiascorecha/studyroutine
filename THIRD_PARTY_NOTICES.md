# Avisos de terceiros

## Dados

- **Quantidade de versículos por capítulo** (`app/src/domain/versification.ts`): extraída do pacote [bible-passage-reference-parser](https://github.com/openbibleinfo/Bible-Passage-Reference-Parser), licença MIT, © Stephen Smith. São apenas números (versículos por capítulo), refinados em tempo de execução pelos marcadores do áudio oficial.

## Fontes tipográficas (empacotadas via @fontsource)

- **Figtree** — © 2022 The Figtree Project Authors. SIL Open Font License 1.1.
- **Newsreader** — © 2020 The Newsreader Project Authors. SIL Open Font License 1.1.

## Bibliotecas

Dependências de código aberto listadas em `app/package.json` e `server/package.json` (React, Capacitor, Fastify, Zod, node-postgres e outras), cada uma sob a própria licença (MIT, Apache-2.0 ou similar). Para gerar a lista completa:

```bash
cd app && npx license-checker --production --summary
cd server && npx license-checker --production --summary
```

## Conteúdo do jw.org

O app não inclui conteúdo do jw.org. Textos, áudios, imagens e marcas pertencem aos seus titulares e são acessados nas fontes oficiais. Ver [docs/fontes-oficiais.md](docs/fontes-oficiais.md).
