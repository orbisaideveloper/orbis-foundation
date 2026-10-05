# Foundation local runtime

Configuration stays outside Git:
~/.config/orbis/local-auth.env (permission 600).

Frontend, in the first Termux session:
cd "$HOME/orbis-foundation"
bash scripts/orbis-local-dev.sh

Backend, in a second Termux session:
cd "$HOME/orbis-foundation"
bash scripts/orbis-local-backend.sh

Open http://localhost:3000.
Keep both sessions running. Stop each with Ctrl+C.
The frontend proxies API requests to backend port 3001.
These launchers do not run database migrations.

Review the local app before committing and pushing.
Never commit environment values or credentials.
Check GitHub Actions and Sonar after pushing.

Accounting protection:
Business invariant tests and mutation tests are implemented.
Reviewed mutation score: 77.43%.
Automated historical replay and complete live-data reconciliation
remain follow-up work; do not treat them as completed.
Review migration status before deploying schema-dependent features.
