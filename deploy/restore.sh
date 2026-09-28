#!/usr/bin/env bash
# Usage: bash deploy/restore.sh /etc/erp/restore.env erp-restore /var/backups/erp/TIMESTAMP
# Deliberately restores only to an isolated project with empty DB and uploads.
set -euo pipefail
umask 077
env_file=${1:?Provide the recovery environment file}
project=${2:?Provide an isolated Compose project ending in -restore}
backup_dir=${3:?Provide a complete backup directory}
repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
compose=(docker compose --project-name "$project" --env-file "$env_file" -f "$repo_root/docker-compose.yml")
[[ -f "$env_file" && "$project" = *-restore && -f "$backup_dir/SHA256SUMS" ]] || { echo 'Use an isolated -restore project and a complete backup' >&2; exit 1; }
running=$("${compose[@]}" ps --status running --services api)
[[ -z "$running" ]] || { echo 'Recovery API must be stopped' >&2; exit 1; }
(
  cd -- "$backup_dir"
  sha256sum --check SHA256SUMS
)
"${compose[@]}" up -d --wait postgres
tables=$("${compose[@]}" exec -T postgres sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = '\''public'\''"')
[[ "$tables" = 0 ]] || { echo 'Refusing to overwrite a non-empty database' >&2; exit 1; }
"${compose[@]}" run --rm --no-deps --entrypoint sh api -c 'test -z "$(find /data/documents -mindepth 1 -print -quit)"' || { echo 'Refusing to overwrite a non-empty uploads volume' >&2; exit 1; }

# Only server-generated, flat UUID filenames and the archive root are accepted.
# Reject links and special files before extracting anything.
listing=$("${compose[@]}" run --rm -T --no-deps --entrypoint tar api -tzf - < "$backup_dir/documents.tar.gz")
while IFS= read -r entry; do
  [[ "$entry" = ./ || "$entry" =~ ^\./[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || { echo 'Unsafe upload archive path' >&2; exit 1; }
done <<< "$listing"
"${compose[@]}" run --rm -T --no-deps --entrypoint tar api -tvzf - < "$backup_dir/documents.tar.gz" | awk 'substr($0,1,1) != "-" && substr($0,1,1) != "d" { bad=1 } END { exit bad }'

"${compose[@]}" exec -T postgres sh -c 'pg_restore --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --no-owner --role "$APP_DB_USER" --single-transaction --exit-on-error' < "$backup_dir/database.dump"
"${compose[@]}" run --rm -T --no-deps --entrypoint tar api -C /data/documents -xzf - < "$backup_dir/documents.tar.gz"
echo 'Database and uploads restored. API is still stopped; validate the recovery before admitting traffic.'
