#!/bin/bash
set -e

BACKUP_ROOT="${BACKUP_ROOT:-/root/prism/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"

mkdir -p "${BACKUP_DIR}"

DB_URL="${DATABASE_URL}"
if [ -z "$DB_URL" ] && [ -f /root/prism/.env ]; then
  DB_URL=$(grep DATABASE_URL /root/prism/.env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
fi

if [ -z "$DB_URL" ]; then
  echo "ERROR: DATABASE_URL not found" >&2
  exit 1
fi

DB_USER=$(echo "$DB_URL" | grep -oP '//\K[^:]+')
DB_PASS=$(echo "$DB_URL" | grep -oP '//[^:]+:\K[^@]+')
DB_HOST=$(echo "$DB_URL" | grep -oP '@\K[^:/]+')
DB_PORT=$(echo "$DB_URL" | grep -oP '@[^:]+:\K\d+' || echo "5432")
DB_NAME=$(echo "$DB_URL" | grep -oP '/\K[^?]+')

echo "=== Backing up PostgreSQL: ${DB_NAME}@${DB_HOST}:${DB_PORT} ==="
PGPASSWORD="${DB_PASS}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -F c \
  -f "${BACKUP_DIR}/prism_db.dump" \
  --no-owner \
  --no-acl

echo "=== Backup saved to ${BACKUP_DIR}/prism_db.dump ==="

echo "=== Cleaning backups older than ${RETENTION_DAYS} days ==="
find "${BACKUP_ROOT}" -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} \; 2>/dev/null || true

echo "=== Current backups ==="
du -sh "${BACKUP_ROOT}"/*/ 2>/dev/null | sort -rh || echo "No backups found"
