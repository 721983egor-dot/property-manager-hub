# Сборка приложения RM OS для self-hosted развёртывания
FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY . .

# Переменные для сборки (попадают в клиентский бандл)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
ENV VITE_SUPABASE_PROJECT_ID=${VITE_SUPABASE_PROJECT_ID}
ENV NODE_ENV=production
# Собираем под обычный Node-сервер, а не под Cloudflare
ENV NITRO_PRESET=node-server
ENV SERVER_PRESET=node-server

# node_modules нужны только на время vite; иначе слой сборки забивает диск Beget.
RUN bun install && bun run build && rm -rf node_modules /root/.bun /tmp/*

# Runtime
FROM node:22-alpine

RUN apk add --no-cache ffmpeg postgresql-client

WORKDIR /app

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public/video-watermark.png ./public/video-watermark.png
COPY --from=builder /app/public/photo-watermark.png ./public/photo-watermark.png
COPY --from=builder /app/deploy/apply-migrations.sh /apply-migrations.sh
COPY --from=builder /app/deploy/preview-entrypoint.sh /preview-entrypoint.sh
COPY --from=builder /app/supabase/migrations /migrations
RUN chmod +x /apply-migrations.sh /preview-entrypoint.sh

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

# На тесте entrypoint применит миграции (PREVIEW_MODE + POSTGRES_PASSWORD).
# Рабочий app без этих переменных просто стартует Node.
CMD ["/bin/sh", "/preview-entrypoint.sh"]
