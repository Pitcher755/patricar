# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 13 no publica prebuilds para el ABI de Node 24: compilamos en el
# stage de dependencias para que la imagen final no lleve toolchain.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/* \
 && npm ci --omit=dev \
 && npm cache clean --force

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/patricar.sqlite \
    TIMEZONE=Europe/Madrid

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
RUN mkdir -p /app/data && chown -R node:node /app

USER node
VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
