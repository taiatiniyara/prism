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
  pm2 restart prism-dev --update-env
  git stash
  echo "Deployment complete!"
EOF