#!/bin/bash
# Создаёт роли и схему auth, необходимые PostgREST/GoTrue/Storage.
# Выполняется один раз при первом запуске контейнера базы.
set -e

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<-SQL
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD '${POSTGRES_PASSWORD}';
  GRANT anon TO authenticator;
  GRANT authenticated TO authenticator;
  GRANT service_role TO authenticator;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  CREATE SCHEMA IF NOT EXISTS auth;

  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS \$\$
      SELECT nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
    \$\$;

  CREATE OR REPLACE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE AS \$\$
      SELECT nullif(current_setting('request.jwt.claims', true)::json ->> 'role', '')::text
    \$\$;

  CREATE OR REPLACE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE AS \$\$
      SELECT nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '')::text
    \$\$;
SQL

echo "init-db: роли и функции auth.* созданы"
