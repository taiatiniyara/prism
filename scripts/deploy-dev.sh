npm run build
if [ $? -ne 0 ]; then
  echo "Build failed. Aborting deployment."
  exit 1
fi
git add .
git commit -m "Deploying the latest updates"
git push origin main

ssh root@156.67.221.57 << 'EOF'
  cd /root/prism
  git pull origin main
  echo "Server updated with the latest code!"

  # Load NVM and Node environment
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  npm install
  psql -U postgres -c "DROP DATABASE IF EXISTS prism;"
  psql -U postgres -c "CREATE DATABASE prism;"
  npm run db-push
  npm run build
  if [ $? -ne 0 ]; then
    echo "Build failed. Aborting deployment."
    exit 1
  fi
  if pm2 describe prism-v2 >/dev/null 2>&1; then
    pm2 restart prism-v2 --update-env
  elif pm2 describe prism-dev >/dev/null 2>&1; then
    pm2 restart prism-dev --update-env
  else
    pm2 start npm --name prism-v2 -- start
  fi
  git stash
  echo "Deployment complete!"
EOF