#!/usr/bin/env bash
# Usage: bash deploy/backup.sh /etc/erp/erp.env /var/backups/erp erp
set -euo pipefail
umask 077
env_file=${1:?Provide an external environment file}
backup_root=${2:?Provide a backup directory outside the checkout}
project=${3:?Provide the Compose project name}
repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
compose=(docker compose --project-name "$project" --env-file "$env_file" -f "$repo_root/docker-compose.yml")
[[ -f "$env_file" && "$backup_root" = /* && "$backup_root" != / ]] || { echo 'Invalid environment file or backup directory' >&2; exit 1; }
mkdir -p -- "$backup_root"
backup_root=$(cd -- "$backup_root" && pwd -P)
repo_root=$(cd -- "$repo_root" && pwd -P)
case "$backup_root/" in "$repo_root/"*) echo 'Backups must be outside the checkout' >&2; exit 1;; esac
backup_dir="$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p -- "$backup_dir"
api_was_running=$("${compose[@]}" ps --status running --services api)
resume_api() {
  if [[ "$api_was_running" = api ]]; then "${compose[@]}" start api >/dev/null; fi
}
trap resume_api EXIT
if [[ "$api_was_running" = api ]]; then "${compose[@]}" stop api >/dev/null; fi

# No API/scheduler writers between the logical dump and the uploads snapshot.
# Operators must also stop any external database writers during this window.
"${compose[@]}" exec -T postgres sh -c 'pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom' > "$backup_dir/database.dump"
"${compose[@]}" run --rm -T --no-deps --entrypoint tar api -C /data/documents -czf - . > "$backup_dir/documents.tar.gz"
"${compose[@]}" exec -T postgres pg_restore --list < "$backup_dir/database.dump" >/dev/null
(
  cd -- "$backup_dir"
  sha256sum database.dump documents.tar.gz > SHA256SUMS
)
printf '%s\n' "$backup_dir"
# No automatic deletion/retention: move an encrypted copy off the VPS and
# monitor this command's exit status. A failed directory has no SHA256SUMS.
