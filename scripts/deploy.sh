#!/bin/bash
set -e

VPS_HOST="${VPS_HOST:-156.67.221.57}"
VPS_USER="${VPS_USER:-root}"
VPS_PATH="${VPS_PATH:-/root/prism}"
APP_NAME="${APP_NAME:-prism-v2}"

echo "=== Building locally to verify ==="
npm run build

echo "=== Pushing to Git ==="
git add .
git commit -m "Deploying latest updates" || echo "Nothing to commit"
git push origin main

echo "=== Deploying to $VPS_HOST ==="
ssh "$VPS_USER@$VPS_HOST" << 'VPS_EOF'
  set -e
  cd /root/prism
  git pull origin main
  echo "Server updated with latest code"

  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

  npm install
  npm run db-push
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
