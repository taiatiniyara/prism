npm install
npm run db-push
if [ $? -ne 0 ]; then
  echo "Drizzle migration failed. Aborting deployment."
  exit 1
fi

npm run build
if [ $? -ne 0 ]; then
  echo "Build failed. Aborting deployment."
  exit 1
fi

git add .
git commit
git push origin main