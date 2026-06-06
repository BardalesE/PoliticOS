#!/usr/bin/env bash
# ─── PoliticOS — Script de configuración inicial VPS (IP directa) ─────────────
# Ejecutar UNA VEZ después del primer deploy, como root o con sudo.
# Uso: sudo bash /var/www/politicos/deploy/setup-vps.sh
#
# Qué hace este script:
#   1. Crea el .env de producción en /var/www/politicos/.env
#   2. Crea el .env.production del frontend en resources/js/.env.production
#   3. Reconstruye el bundle de Next.js con la URL correcta
#   4. Corre migraciones y calienta los caches de Laravel
#   5. Reinicia todos los servicios
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

APP_DIR="/var/www/politicos"
NEXT_DIR="${APP_DIR}/resources/js"

# ── Instalar pre-commit hook de seguridad ─────────────────────────────────────
cd "$APP_DIR"
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
echo "✓ Pre-commit hook de secretos instalado"

# ── Detectar IP pública del servidor ──────────────────────────────────────────
VPS_IP=$(curl -s https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
echo "IP detectada: ${VPS_IP}"

# ── STEP 1: Configurar .env de Laravel ────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " PASO 1 — Configurando .env de Laravel"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ENV_FILE="${APP_DIR}/.env"

# Solicitar datos interactivamente
echo ""
read -r -p "GROQ API Key (gsk_...): " GROQ_KEY
read -r -p "ANTHROPIC API Key (sk-ant-... o Enter para omitir): " ANTHROPIC_KEY
read -r -p "MySQL password para root (o Enter si es vacío): " DB_PASSWORD
read -r -p "SUPER_ADMIN_KEY (clave para acceder al panel /superadmin): " SA_KEY
read -r -p "APP_KEY de Laravel (base64:... de 'php artisan key:generate --show'): " APP_KEY_VALUE

# Generar APP_KEY si no se proporcionó
if [[ -z "$APP_KEY_VALUE" ]]; then
    cd "$APP_DIR"
    APP_KEY_VALUE=$(php artisan key:generate --show 2>/dev/null)
    echo "   ✓ APP_KEY generado automáticamente"
fi

cat > "${ENV_FILE}" << EOF
APP_NAME=PoliticOS
APP_ENV=production
APP_KEY=${APP_KEY_VALUE}
APP_DEBUG=false
APP_URL=http://${VPS_IP}

APP_LOCALE=es
APP_FALLBACK_LOCALE=es
APP_FAKER_LOCALE=es_PE
APP_MAINTENANCE_DRIVER=file

BCRYPT_ROUNDS=12

LOG_CHANNEL=stack
LOG_STACK=single
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=warning

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=bdpolitic
DB_USERNAME=root
DB_PASSWORD=${DB_PASSWORD}

# ─── Session / Cache / Queue ──────────────────────────────────────────────────
# Usa "database" si no tienes Redis configurado.
# Cambia a "redis" si Redis está corriendo en el VPS.
SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_ENCRYPT=false
SESSION_PATH=/
SESSION_DOMAIN=${VPS_IP}

CACHE_STORE=database
QUEUE_CONNECTION=database

BROADCAST_CONNECTION=log
FILESYSTEM_DISK=local
MEDIA_DISK=public

MAIL_MAILER=log
MAIL_FROM_ADDRESS="noreply@politicos.pe"
MAIL_FROM_NAME="PoliticOS"

# ─── IA ───────────────────────────────────────────────────────────────────────
AI_PROVIDER=groq
GROQ_API_KEY=${GROQ_KEY}
GROQ_MODEL=llama-3.3-70b-versatile
ANTHROPIC_API_KEY=${ANTHROPIC_KEY}
CLAUDE_MODEL=claude-haiku-4-5-20251001
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
AI_MAX_TOKENS=600

# ─── Embeddings ───────────────────────────────────────────────────────────────
AI_EMBEDDINGS_DRIVER=mysql_fulltext

# ─── Sanctum / CORS ───────────────────────────────────────────────────────────
SANCTUM_STATEFUL_DOMAINS=${VPS_IP}

FRONTEND_URL=http://${VPS_IP}
CORS_ALLOWED_PATTERN=

# ─── SuperAdmin ───────────────────────────────────────────────────────────────
SUPER_ADMIN_KEY=${SA_KEY}

VITE_APP_NAME="PoliticOS"
EOF

echo "   ✓ .env creado en ${ENV_FILE}"

# ── STEP 2: Configurar .env.production del frontend ───────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " PASO 2 — Configurando .env.production del frontend"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cat > "${NEXT_DIR}/.env.production" << EOF
NEXT_PUBLIC_API_URL=http://${VPS_IP}/api
NEXT_PUBLIC_BASE_DOMAIN=
NEXT_PUBLIC_TENANT_SLUG=
NEXT_PUBLIC_USE_MOCK=false
EOF

echo "   ✓ .env.production del frontend creado"

# ── STEP 3: Rebuild Next.js con la URL correcta ───────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " PASO 3 — Reconstruyendo frontend Next.js"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$NEXT_DIR"
npm ci --prefer-offline --silent
npm run build
cp -r .next/static .next/standalone/.next/static
[ -d public ] && cp -r public .next/standalone/public || true
echo "   ✓ Next.js build completo"

cd "$APP_DIR"

# ── STEP 4: Laravel — permisos, migraciones, caches ───────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " PASO 4 — Configurando Laravel"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache
php artisan storage:link --quiet 2>/dev/null || true

# Crear tablas de session/cache/queue en DB si no existen
php artisan migrate --force 2>&1 | tail -5

php artisan config:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
echo "   ✓ Migraciones y caches OK"

# ── STEP 5: Reiniciar servicios ────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " PASO 5 — Reiniciando servicios"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

sudo supervisorctl restart politicos:* 2>/dev/null || echo "   ⚠ supervisorctl falló — reinicia manualmente"
sudo nginx -t && sudo systemctl reload nginx 2>/dev/null || echo "   ⚠ nginx reload falló — revisa la config"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✓ Setup completo"
echo ""
echo "  Prueba el backend:"
echo "    curl http://${VPS_IP}/up"
echo ""
echo "  Prueba el SuperAdmin:"
echo "    curl -H 'X-Super-Admin-Key: ${SA_KEY}' http://${VPS_IP}/api/superadmin/tenants"
echo ""
echo "  Frontend: http://${VPS_IP}:3000"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
