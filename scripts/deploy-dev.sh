
git add .
git commit -m "Deploying the latest updates"
git push origin main
echo "Deployment complete!"

ssh root@156.67.221.57 << 'EOF'
  cd /root/prism
  git pull origin main
  echo "Server updated with the latest code!"

  # Load NVM and Node environment
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  npm install
  npm run db-push
  npm run build
  pm2 reload prism-dev
EOF