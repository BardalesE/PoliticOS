# ─────────────────────────────────────────────────────────────────────────────
# PoliticOS — backend Laravel 12 / PHP 8.2 para Render (web service Docker)
#
# Un solo contenedor: php-fpm + nginx (supervisord). nginx escucha en $PORT
# (Render lo inyecta; ver deploy/render/entrypoint.sh y nginx.conf.template).
#
# El frontend Next.js NO se buildea aquí (vive en Vercel). El backend es una
# API REST pura: no necesita assets compilados.
#
# Demo sin Redis: QUEUE_CONNECTION=sync, CACHE_STORE=file,
# SESSION_DRIVER=database (variables, no código — ver .env.render.example).
# ─────────────────────────────────────────────────────────────────────────────
FROM php:8.2-fpm-bookworm

# ── Paquetes del sistema ─────────────────────────────────────────────────────
# nginx + supervisor (proceso único de Render), gettext-base (envsubst para
# templar $PORT), y libs de las extensiones PHP.
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx \
        supervisor \
        gettext-base \
        unzip \
        git \
        curl \
        libpng-dev \
        libjpeg62-turbo-dev \
        libfreetype6-dev \
        libwebp-dev \
        libzip-dev \
        libicu-dev \
        libonig-dev \
    && rm -rf /var/lib/apt/lists/*

# ── Extensiones PHP ──────────────────────────────────────────────────────────
# pdo_mysql (MySQL 8 de Railway), mbstring, bcmath, gd, zip, intl + opcache.
# Redis NO hace falta: composer.json usa predis (cliente PHP puro) y la demo
# ni siquiera usa Redis.
RUN docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
    && docker-php-ext-install -j"$(nproc)" \
        pdo_mysql \
        mbstring \
        bcmath \
        gd \
        zip \
        intl \
        opcache

# php.ini de producción + overrides del proyecto
RUN cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"
COPY deploy/render/php.ini "$PHP_INI_DIR/conf.d/zz-politicos.ini"

# Pool de php-fpm: un poco más de headroom para streams SSE concurrentes
# (cada chat abierto retiene un worker mientras streamea).
RUN { \
        echo '[www]'; \
        echo 'pm = dynamic'; \
        echo 'pm.max_children = 12'; \
        echo 'pm.start_servers = 3'; \
        echo 'pm.min_spare_servers = 2'; \
        echo 'pm.max_spare_servers = 6'; \
        echo 'catch_workers_output = yes'; \
    } > /usr/local/etc/php-fpm.d/zz-politicos.conf

# ── Composer ─────────────────────────────────────────────────────────────────
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Capa de dependencias cacheable: solo composer.json/lock primero.
COPY composer.json composer.lock ./
RUN composer install \
        --no-dev \
        --no-scripts \
        --no-autoloader \
        --no-interaction \
        --no-progress \
        --prefer-dist

# ── Código de la aplicación ──────────────────────────────────────────────────
COPY . .

# Autoloader optimizado + manifiesto de paquetes (post-autoload-dump ejecuta
# `artisan package:discover`; corre sin .env — no toca la BD).
RUN composer dump-autoload --optimize --no-dev \
    && php artisan package:discover --ansi

# Permisos de escritura de Laravel
RUN chown -R www-data:www-data storage bootstrap/cache

# ── nginx / supervisord / entrypoint ─────────────────────────────────────────
COPY deploy/render/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/render/supervisord.conf    /etc/supervisor/supervisord.conf
COPY deploy/render/entrypoint.sh       /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Puerto por defecto si Render no inyecta PORT (Render SIEMPRE la inyecta).
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
