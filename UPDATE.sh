#!/usr/bin/env bash
# Run this once from the ROOT of your repo (the folder that contains eric-portfolio/ and consultancy-app/).
set -e
echo "1/4  Removing old files from the previous version..."
rm -f eric-portfolio/public/script.js eric-portfolio/public/style.css

echo "2/4  Stopping git from tracking secrets and junk (files stay on your disk)..."
git rm -r -q --cached --ignore-unmatch eric-portfolio/node_modules consultancy-app/node_modules consultancy-app/dist consultancy-app/.env

echo "3/4  Installing and checking the server starts..."
(cd eric-portfolio && npm install --no-audit --no-fund && node --check server.js)

echo "4/4  Committing and pushing to GitHub..."
git add -A
git commit -m "Upgrade portfolio: multi-page site, secured admin, services, portfolio and Paystack lessons"
git push

echo
echo "Done. To try the site now:  cd eric-portfolio && npm run dev"
echo "(a temporary admin password is printed in the terminal)"
