#!/bin/bash
# Применяет SQL-миграции проекта к базе на сервере.
# Запускается как одноразовый сервис `migrator` перед стартом приложения.
set -euo pipefail

# Таблицы перенесённой базы принадлежат supabase_admin. Миграции должны
# выполняться от этого владельца, иначе PostgreSQL запрещает менять RLS.
DB_URL="postgres://supabase_admin:${POSTGRES_PASSWORD}@supabase-db:5432/postgres"
DIR="/migrations"
# Все миграции до этой включительно уже были применены на сервере вручную.
BASELINE="20260909175932"
# Эти версии доступа обращались к таблицам напрямую и могли остановить
# обновление на сервере с отличающимся набором необязательных модулей.
# Их заменяют безопасные миграции, проверяющие наличие каждой таблицы.
SUPERSEDED=(
  "20260910053310_d2331599-825d-4b8c-9212-485f12aa4530.sql"
  "20260910054021_37a74f27-17b5-43ea-a665-1a12f05ee683.sql"
  "20260910094923_8078fbf4-8095-4677-a9c6-80b24005f65c.sql"
)

echo "== Миграции RM OS =="

for i in $(seq 1 60); do
  if psql "$DB_URL" -c 'select 1' >/dev/null 2>&1; then break; fi
  echo "ждём базу ($i)"
  sleep 2
done

psql "$DB_URL" -v ON_ERROR_STOP=1 -c \
  'CREATE TABLE IF NOT EXISTS public.schema_migrations_rmos (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'

# Первый запуск: помечаем всё до baseline как применённое.
for f in "$DIR"/*.sql; do
  name=$(basename "$f")
  skip=false
  for superseded in "${SUPERSEDED[@]}"; do
    if [ "$name" = "$superseded" ]; then skip=true; break; fi
  done
  if [[ "${name%%_*}" < "$BASELINE" || "${name%%_*}" == "$BASELINE" || "$skip" == true ]]; then
    psql "$DB_URL" -q -c "INSERT INTO public.schema_migrations_rmos(name) VALUES ('$name') ON CONFLICT DO NOTHING" >/dev/null
  fi
done

for f in "$DIR"/*.sql; do
  name=$(basename "$f")
  done_row=$(psql "$DB_URL" -tA -c "SELECT 1 FROM public.schema_migrations_rmos WHERE name = '$name'")
  if [ "$done_row" = "1" ]; then continue; fi

  echo "-> применяю $name"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$f"; then
    psql "$DB_URL" -q -c "INSERT INTO public.schema_migrations_rmos(name) VALUES ('$name') ON CONFLICT DO NOTHING" >/dev/null
    echo "   ок"
  else
    echo "   ОШИБКА в $name — обновление остановлено, работающая версия приложения продолжит работать"
    exit 1
  fi
done

echo "== Миграции успешно применены =="
