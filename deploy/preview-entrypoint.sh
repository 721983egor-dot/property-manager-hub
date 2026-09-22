#!/bin/sh
# Старт контейнера: на тесте (PREVIEW_MODE) применяем миграции, если есть пароль БД.
set -eu

should_migrate=0
if [ "${APPLY_MIGRATIONS_ON_START:-}" = "1" ]; then should_migrate=1; fi
if [ "${PREVIEW_MODE:-}" = "1" ]; then should_migrate=1; fi

if [ "$should_migrate" = "1" ] && [ -n "${POSTGRES_PASSWORD:-}" ] && [ -f /apply-migrations.sh ]; then
  echo "== preview: миграции при старте =="
  if /bin/sh /apply-migrations.sh; then
    echo "== preview: миграции ок =="
  else
    echo "== preview: миграции не применились — приложение всё равно стартует =="
  fi
elif [ "$should_migrate" = "1" ]; then
  echo "== preview: POSTGRES_PASSWORD не задан — миграции пропущены =="
fi

exec node .output/server/index.mjs
