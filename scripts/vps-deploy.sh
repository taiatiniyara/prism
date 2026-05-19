#!/bin/bash
set -e

APP_DIR="/root/prism"
PM2_NAME="prism-v2"

echo "=== Pulling latest changes ==="
cd "$APP_DIR"
git pull origin main

echo "=== Installing dependencies ==="
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
npm install

echo "=== Running DB migration ==="
npm run db-push

echo "=== Building application ==="
npm run build

echo "=== Restarting PM2 ==="
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
else
  pm2 start npm --name "$PM2_NAME" -- start
fi

echo "=== Deployment complete ==="
