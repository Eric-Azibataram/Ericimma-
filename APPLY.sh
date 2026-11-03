#!/usr/bin/env bash
# Run from the ROOT of your repo. Adds the Pictures feature and saves it to GitHub.
set -e
node --check eric-portfolio/server.js
git add eric-portfolio/server.js eric-portfolio/lib eric-portfolio/public
git commit -m "Pictures: fix photo upload, refresh cached scripts"
git push
echo "Done. Restart the server:  cd eric-portfolio && ADMIN_PASSWORD='your-password' npm run dev"
