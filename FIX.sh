#!/usr/bin/env bash
# Run from the ROOT of your repo. Saves the login fix to GitHub.
set -e
node --check eric-portfolio/server.js
git add eric-portfolio/server.js
git commit -m "Fix admin login behind Codespaces/proxy origin check; dev ADMIN_PASSWORD option"
git push
echo "Done. Now restart the server:  cd eric-portfolio && ADMIN_PASSWORD='choose-a-password' npm run dev"
