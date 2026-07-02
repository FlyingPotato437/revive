#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi
if ! command -v pg_dump >/dev/null 2>&1 || ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_dump and pg_restore are required" >&2
  exit 1
fi

directory="${REVIVE_BACKUP_DIR:-.revive/backups}"
mkdir -p "$directory"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$directory/revive-$stamp.dump"
umask 077
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file="$target"
pg_restore --list "$target" >/dev/null
echo "$target"
