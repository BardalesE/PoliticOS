#!/usr/bin/env bash
# ─── PoliticOS — Production deploy script ─────────────────────────────────────
# Uso: ./deploy/deploy.sh [--skip-migrations] [--skip-frontend]
#
# Requisitos del servidor:
#   - Ubuntu 22.04, PHP 8.2-FPM, MySQL 8, Node 20, Nginx, Redis, Supervisor
#   - App root: /var/www/politicos
#   - .env configurado en el servidor (nunca commitear)
#   - Usuario deploy con sudo limitado a: supervisorctl, nginx, systemctl
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

APP_DIR="/var/www/politicos"
NEXT_DIR="${APP_DIR}/resources/js"
BACKUP_DIR="/var/backups/politicos"
SKIP_MIGRATIONS=false
SKIP_FRONTEND=false
DEPLOY_START=$(date +%s)

for arg in "$@"; do
    case $arg in
        --skip-migrations) SKIP_MIGRATIONS=true ;;
        --skip-frontend)   SKIP_FRONTEND=true   ;;
    esac
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " PoliticOS deploy — $(date '+%Y-%m-%d %H:%M:%S')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$APP_DIR"

# ── 1. Backup de BD ANTES de migrar (rollback manual si algo falla) ───────────
if [[ "$SKIP_MIGRATIONS" == false ]]; then
    echo "▶ 1/9  Backup pre-deploy de base de datos..."
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="${BACKUP_DIR}/pre-deploy_$(date +%Y%m%d_%H%M%S).sql.gz"
    # Lee credenciales del .env sin sourcear el archivo completo
    DB_HOST=$(grep '^DB_HOST=' .env | cut -d= -f2)
    DB_USER=$(grep '^DB_USERNAME=' .env | cut -d= -f2)
    DB_PASS=$(grep '^DB_PASSWORD=' .env | cut -d= -f2)
    mysqldump -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" --all-databases \
        --single-transaction --quick 2>/dev/null | gzip > "$BACKUP_FILE"
    echo "   ✓ Backup guardado: $BACKUP_FILE"
else
    echo "▶ 1/9  Backup omitido (--skip-migrations)"
fi

# ── 2. Pull latest code ───────────────────────────────────────────────────────
echo "▶ 2/9  Pulling latest code..."
git pull origin main

# ── 3. PHP dependencies ───────────────────────────────────────────────────────
echo "▶ 3/9  Installing PHP dependencies..."
composer install --no-dev --no-interaction --optimize-autoloader --quiet

# ── 4. Node dependencies & build ─────────────────────────────────────────────
if [[ "$SKIP_FRONTEND" == false ]]; then
    echo "▶ 4/9  Building Next.js frontend..."
    cd "$NEXT_DIR"
    npm ci --prefer-offline --silent
    npm run build
    # Standalone mode: copiar assets estáticos al directorio de producción
    cp -r .next/static .next/standalone/.next/static
    [ -d public ] && cp -r public .next/standalone/public || true
    cd "$APP_DIR"
else
    echo "▶ 4/9  Build frontend omitido (--skip-frontend)"
fi

# ── 5. Storage y permisos ─────────────────────────────────────────────────────
echo "▶ 5/9  Setting up storage..."
php artisan storage:link --quiet 2>/dev/null || true
chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache

# ── 6. Activar modo mantenimiento ─────────────────────────────────────────────
echo "▶ 6/9  Enabling maintenance mode..."
php artisan down --retry=15 --secret="deploy-$(date +%s)" 2>/dev/null || true

# ── 7. Migraciones ────────────────────────────────────────────────────────────
if [[ "$SKIP_MIGRATIONS" == false ]]; then
    echo "▶ 7/9  Running migrations..."
    php artisan migrate --force
else
    echo "▶ 7/9  Skipping migrations (--skip-migrations)"
fi

# ── 8. Caches de Laravel + flush de Redis ────────────────────────────────────
echo "▶ 8/9  Warming caches..."
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache
# Limpiar caché de aplicación (intel, realtime, etc.) para que tome el código nuevo
php artisan cache:clear

# ── 9. Reiniciar servicios ────────────────────────────────────────────────────
echo "▶ 9/9  Restarting services..."
php artisan queue:restart                    # señal a los workers para reiniciarse
sudo supervisorctl restart politicos:*       # Supervisor reinicia workers + Next.js
sudo nginx -t && sudo systemctl reload nginx # Reload sin downtime

# Desactivar modo mantenimiento
php artisan up

ELAPSED=$(( $(date +%s) - DEPLOY_START ))
echo ""
echo "✓ Deploy completado en ${ELAPSED}s"
echo "  API:     https://api.politicos.pe/up"
echo "  Frontend: https://james.politicos.pe"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Health check final ────────────────────────────────────────────────────────
echo "Verificando API..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.politicos.pe/up 2>/dev/null || echo "000")
if [[ "$HTTP_STATUS" == "200" ]]; then
    echo "✓ API responde 200 OK"
else
    echo "⚠ API respondió HTTP ${HTTP_STATUS} — revisa los logs:"
    echo "  sudo tail -50 /var/log/nginx/politicos-api-error.log"
    echo "  sudo tail -50 /var/log/supervisor/politicos-queue.log"
fi
