# Сборка приложения RM OS для self-hosted развёртывания
FROM node:22-alpine AS builder

WORKDIR /app

# Установка зависимостей
COPY package.json bunfig.toml ./
RUN apk add --no-cache curl && \
    curl -fsSL https://bun.sh/install | bash && \
    mv /root/.bun/bin/bun /usr/local/bin/bun

COPY . .

# Переменные для сборки под Node SSR
ENV NODE_ENV=production
ENV NITRO_PRESET=node-server

RUN bun install && bun run build

# Runtime
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./package.json

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
