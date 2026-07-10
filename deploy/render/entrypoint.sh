#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# PoliticOS — entrypoint del contenedor de Render
#
# Orden de arranque:
#   1. Directorios de storage (el disco persistente de Render puede montarse
#      vacío sobre storage/app/public; los framework/* los borra .dockerignore).
#   2. storage:link, config:cache, route:cache.
#   3. Migraciones (idempotentes; no tumban el arranque si ya corrieron).
#      NOTA: la conexión `central` apunta al MISMO schema que DB_DATABASE
#      (ver config/database.php: ambas leen DB_DATABASE), así que UN solo
#      `migrate` cubre central + tenant por defecto. La BD del tenant de la
#      demo se crea aparte con `php artisan tenant:provision` (ver DEPLOY-DEMO.md).
#   4. Seed opcional (RUN_SEED=true solo en el primer deploy; seeders
#      idempotentes con firstOrCreate, pero mejor no correrlos siempre).
#   5. nginx en $PORT (Render lo inyecta) + php-fpm vía supervisord.
# ─────────────────────────────────────────────────────────────────────────────
set -u

cd /var/www/html

export PORT="${PORT:-8080}"
# Si APP_URL no fue seteada, usar la URL pública que Render expone.
export APP_URL="${APP_URL:-${RENDER_EXTERNAL_URL:-http://localhost:${PORT}}}"

echo "[entrypoint] PORT=${PORT}  APP_URL=${APP_URL}"

# 1 ── storage ────────────────────────────────────────────────────────────────
mkdir -p storage/framework/cache/data \
         storage/framework/sessions \
         storage/framework/views \
         storage/logs \
         storage/app/public \
         bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache || true

# 2 ── caches de Laravel (con env real de Render, por eso en runtime) ─────────
php artisan storage:link  || echo "[entrypoint] WARN: storage:link falló (¿symlink ya existe?)"
php artisan config:cache  || echo "[entrypoint] WARN: config:cache falló"
php artisan route:cache   || echo "[entrypoint] WARN: route:cache falló (rutas con closures no son cacheables)"

# 3 ── migraciones (ambas conexiones = mismo schema, ver nota arriba) ─────────
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    php artisan migrate --force \
        || echo "[entrypoint] WARN: migrate falló — revisa credenciales DB_* / que la BD de Railway esté arriba"
    # Las BDs de los tenants (tabla `tenants`) NO las cubre el migrate de
    # arriba: sin esto, una migración nueva deja los schemas de tenant
    # desactualizados y los endpoints públicos que usan columnas nuevas
    # devuelven 500. Idempotente, no tumba el arranque.
    php artisan tenant:migrate --force \
        || echo "[entrypoint] WARN: tenant:migrate falló — revisa la tabla tenants / credenciales por tenant"
fi

# 4 ── seed inicial (solo primer deploy: RUN_SEED=true) ───────────────────────
if [ "${RUN_SEED:-false}" = "true" ]; then
    php artisan db:seed --force \
        || echo "[entrypoint] WARN: db:seed falló"
fi

# 5 ── nginx en \$PORT + php-fpm ───────────────────────────────────────────────
# envsubst SOLO con ${PORT}: la plantilla usa $uri, $query_string, etc. de nginx
# que NO deben sustituirse.
envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
rm -f /etc/nginx/sites-enabled/default

exec supervisord -c /etc/supervisor/supervisord.conf
