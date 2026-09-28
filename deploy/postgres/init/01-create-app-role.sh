#!/bin/sh
# Only runs on first initialization of the PostgreSQL data volume.
set -eu
: "${APP_DB_USER:?APP_DB_USER is required}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"
if [ "$APP_DB_USER" = "$POSTGRES_USER" ]; then
  echo "Application and bootstrap database roles must be different" >&2
  exit 1
fi

# psql variables + format(%I/%L) quote identifiers and passwords safely.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_user="$APP_DB_USER" --set=app_password="$APP_DB_PASSWORD" \
  --set=app_db="$POSTGRES_DB" --set=allow_createdb="${APP_DB_ALLOW_CREATEDB:-false}" <<'EOSQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('ALTER ROLE %I %s', :'app_user', CASE WHEN :'allow_createdb' = 'true' THEN 'CREATEDB' ELSE 'NOCREATEDB' END) \gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'app_db', :'app_user') \gexec
SELECT format('ALTER SCHEMA public OWNER TO %I', :'app_user') \gexec
EOSQL
