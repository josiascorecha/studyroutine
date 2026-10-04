# syntax=docker/dockerfile:1
# StudyRoutine — imagem única: API de sincronização + versão web do app (mesma origem).
# Independente de qualquer outro projeto da VPS: só usa imagens públicas do Node.

FROM node:22-bookworm-slim AS web
WORKDIR /src/app
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./
# Sem VITE_ALLOW_DATE_OVERRIDE: a simulação de data (?hoje=) só existe em builds de teste.
RUN npm run build

FROM node:22-bookworm-slim AS server
WORKDIR /src/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STATIC_DIR=/app/public
WORKDIR /app/server
COPY --from=server /src/server/node_modules ./node_modules
COPY --from=server /src/server/dist ./dist
COPY server/package.json ./
COPY server/migrations ./migrations
COPY server/catalog ./catalog
COPY --from=web /src/app/dist /app/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
