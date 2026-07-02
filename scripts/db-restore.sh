#!/usr/bin/env sh
set -eu

if [ "${REVIVE_RESTORE_CONFIRM:-}" != "RESTORE_REVIVE_DATABASE" ]; then
  echo "Set REVIVE_RESTORE_CONFIRM=RESTORE_REVIVE_DATABASE to continue" >&2
  exit 1
fi
if [ -z "${DATABASE_URL:-}" ] || [ -z "${1:-}" ]; then
  echo "Usage: DATABASE_URL=... REVIVE_RESTORE_CONFIRM=RESTORE_REVIVE_DATABASE npm run db:restore -- backup.dump" >&2
  exit 1
fi
if [ ! -f "$1" ]; then
  echo "Backup file not found" >&2
  exit 1
fi

pg_restore --list "$1" >/dev/null
pg_restore "$DATABASE_URL" --clean --if-exists --no-owner --no-acl "$1"
echo "Restore completed"
