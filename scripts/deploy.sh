#!/bin/bash
set -e

VPS_HOST="${VPS_HOST:-156.67.221.57}"
VPS_USER="${VPS_USER:-root}"
VPS_PATH="${VPS_PATH:-/root/prism}"
APP_NAME="${APP_NAME:-prism-v2}"
DRY_RUN="${DRY_RUN:-false}"

echo "=== Building locally to verify ==="
npm run build

echo "=== Pushing to Git ==="
git add .
git commit -m "Deploying latest updates" || echo "Nothing to commit"
git push origin main

BACKUP_DIR="${VPS_PATH}/backups"
BACKUP_FILE="prism_db_$(date +%Y%m%d_%H%M%S).sql"

echo "=== Pre-deploy database backup to ${BACKUP_DIR}/${BACKUP_FILE} ==="
ssh "$VPS_USER@$VPS_HOST" "
  set -e
  mkdir -p ${BACKUP_DIR}
  PGPASSWORD=\$(grep DATABASE_URL /root/prism/.env | cut -d'/' -f3 | cut -d'@' -f1 | cut -d':' -f3) || true
  DB_NAME=\$(grep DATABASE_URL /root/prism/.env | grep -oP '[^/]+(?=\?)' | head -1)
  DB_USER=\$(grep DATABASE_URL /root/prism/.env | grep -oP '//\K[^:]+' | head -1)
  DB_HOST=\$(grep DATABASE_URL /root/prism/.env | grep -oP '@\K[^:]+' | head -1)
  if command -v pg_dump &>/dev/null && [ -n \"\$DB_NAME\" ]; then
    pg_dump -h \"\$DB_HOST\" -U \"\$DB_USER\" -d \"\$DB_NAME\" -F c -f \"${BACKUP_FILE}\" 2>/dev/null || \
      pg_dump \"\$DB_NAME\" -F c -f \"${BACKUP_FILE}\" 2>/dev/null || \
      echo \"WARNING: pg_dump failed, proceeding without backup\"
    echo \"Backup saved to ${BACKUP_DIR}/${BACKUP_FILE}\"
  else
    echo \"WARNING: pg_dump not available, skipping backup\"
  fi
"

if [ "$DRY_RUN" = "true" ]; then
  echo "=== DRY RUN: skipping server deploy ==="
  exit 0
fi

echo "=== Deploying to $VPS_HOST ==="
ssh "$VPS_USER@$VPS_HOST" << 'VPS_EOF'
  set -e
  cd /root/prism
  git pull origin main
  echo "Server updated with latest code"

  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

  npm install

  if [ "${SKIP_DB_PUSH:-false}" != "true" ]; then
    echo "=== Running db-push (set SKIP_DB_PUSH=true to skip) ==="
    npm run db-push
  else
    echo "=== SKIP_DB_PUSH set, skipping schema push ==="
  fi

  npm run build

  if pm2 describe prism-v2 >/dev/null 2>&1; then
    pm2 restart prism-v2 --update-env
    echo "PM2 restarted prism-v2"
  else
    pm2 start npm --name prism-v2 -- start
    echo "PM2 started prism-v2"
  fi

  echo "=== Deployment complete ==="
VPS_EOF
