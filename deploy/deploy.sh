#!/usr/bin/env bash
# ─── PoliticOS — Production deploy script ─────────────────────────────────────
# Usage: ./deploy/deploy.sh [--skip-migrations]
#
# Assumptions:
#   - Server: Ubuntu 22.04, PHP 8.2-FPM, MySQL 8, Node 20, nginx
#   - App root: /var/www/politicos
#   - Running as www-data or a deploy user with sudo for service restarts
#   - .env already configured on the server (never committed)

set -euo pipefail

APP_DIR="/var/www/politicos"
NEXT_DIR="${APP_DIR}/resources/js"
SKIP_MIGRATIONS="${1:-}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " PoliticOS deploy — $(date '+%Y-%m-%d %H:%M:%S')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$APP_DIR"

# ── 1. Pull latest code ───────────────────────────────────────────────────────
echo "▶ 1/8  Pulling latest code..."
git pull origin main

# ── 2. PHP dependencies ───────────────────────────────────────────────────────
echo "▶ 2/8  Installing PHP dependencies..."
composer install --no-dev --no-interaction --optimize-autoloader --quiet

# ── 3. Node dependencies & build ─────────────────────────────────────────────
echo "▶ 3/8  Building Next.js frontend..."
cd "$NEXT_DIR"
npm ci --prefer-offline --silent
npm run build
# Next.js standalone mode requires manual copy of static assets
cp -r .next/static  .next/standalone/.next/static
[ -d public ] && cp -r public .next/standalone/public || true
cd "$APP_DIR"

# ── 4. Storage setup ─────────────────────────────────────────────────────────
echo "▶ 4/8  Setting up storage..."
php artisan storage:link --quiet 2>/dev/null || true   # idempotent
chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache

# ── 5. Laravel cache ─────────────────────────────────────────────────────────
echo "▶ 5/8  Warming Laravel caches..."
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache

# ── 6. Database migrations ────────────────────────────────────────────────────
if [[ "$SKIP_MIGRATIONS" != "--skip-migrations" ]]; then
    echo "▶ 6/8  Running migrations..."
    php artisan migrate --force
else
    echo "▶ 6/8  Skipping migrations (--skip-migrations)"
fi

# ── 7. Restart services ───────────────────────────────────────────────────────
echo "▶ 7/8  Restarting workers and frontend..."
php artisan queue:restart
sudo supervisorctl restart politicos:*

# ── 8. Reload nginx ───────────────────────────────────────────────────────────
echo "▶ 8/8  Reloading nginx..."
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "✓ Deploy complete."
echo "  API:    https://api.politicos.pe"
echo "  Admin:  https://admin.politicos.pe  (or any slug subdomain)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
