#!/bin/sh
# Runs once, automatically, only when the data directory is first
# initialized (official postgres image behavior for docker-entrypoint-initdb.d).
#
# POSTGRES_USER/POSTGRES_PASSWORD bootstrap a cluster superuser that the
# application never uses directly. This script creates a separate role,
# scoped to owning only this database (not the cluster), and DATABASE_URL
# (see docker-compose.yml) points at that role instead. It also gets CREATEDB
# — not superuser — solely so `prisma migrate dev` can create its throwaway
# shadow database locally; `migrate deploy` (production) needs no such thing.
set -e

if [ -z "$APP_DB_USER" ] || [ -z "$APP_DB_PASSWORD" ]; then
  echo "APP_DB_USER/APP_DB_PASSWORD not set; skipping least-privilege app role creation" >&2
  exit 0
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$APP_DB_USER') THEN
      CREATE ROLE "$APP_DB_USER" LOGIN PASSWORD '$APP_DB_PASSWORD';
    END IF;
  END
  \$\$;
  ALTER ROLE "$APP_DB_USER" CREATEDB;
  ALTER DATABASE "$POSTGRES_DB" OWNER TO "$APP_DB_USER";
  GRANT ALL PRIVILEGES ON DATABASE "$POSTGRES_DB" TO "$APP_DB_USER";
  -- Database ownership doesn't retroactively transfer ownership of the
  -- public schema created during CREATE DATABASE (PG15+ no longer grants
  -- CREATE on it to everyone), so hand that over explicitly too.
  ALTER SCHEMA public OWNER TO "$APP_DB_USER";
EOSQL
