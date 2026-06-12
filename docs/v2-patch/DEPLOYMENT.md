# Deployment — PoliticOS v2

VPS recomendado: **Hetzner CPX31** (4 vCPU, 8 GB RAM, 160 GB SSD, €16/mes).
SO: Ubuntu 24.04 LTS.

## Topología

```
┌─────────────────────────────────────────┐
│  Cloudflare (TLS + caching estáticos)   │
└──────────────┬──────────────────────────┘
               │
       ┌───────▼───────┐
       │  Nginx (80/443) │  ← reverse proxy
       └───┬────────┬───┘
           │        │
   ┌───────▼───┐  ┌─▼────────────────┐
   │ Laravel   │  │ Next.js (PM2)    │
   │ (PHP-FPM) │  │ port 3000        │
   │ port 9000 │  └──────────────────┘
   └─────┬─────┘
         │
    ┌────▼─────────────────────────────┐
    │  MySQL 8.0  Redis 7  Qdrant 1.10  │
    │  (tenants)  (queues) (vectors,   │
    │                       opcional)   │
    └────┬─────────────────────────────┘
         │
   ┌─────▼────────────────────────────┐
   │  Servicio Python (Docker compose)│
   │   FastAPI + Celery worker + beat │
   │   port 8001                      │
   └──────────────────────────────────┘
```

## 1. Provisioning rápido (Ubuntu 24.04)

```bash
# Como root o sudo
apt update && apt upgrade -y
apt install -y software-properties-common curl unzip git

# PHP 8.3
add-apt-repository ppa:ondrej/php -y
apt update
apt install -y php8.3-fpm php8.3-mysql php8.3-mbstring php8.3-xml php8.3-curl \
  php8.3-zip php8.3-bcmath php8.3-gd php8.3-redis php8.3-intl

# Composer
curl -sS https://getcomposer.org/installer | php
mv composer.phar /usr/local/bin/composer

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# MySQL 8
apt install -y mysql-server
mysql_secure_installation

# Redis
apt install -y redis-server
systemctl enable redis-server

# Nginx
apt install -y nginx
systemctl enable nginx

# Docker (para el stack Python)
apt install -y docker.io docker-compose-plugin
systemctl enable docker

# Supervisor (para queue workers)
apt install -y supervisor

# Certbot (Let's Encrypt)
apt install -y certbot python3-certbot-nginx
```

## 2. Crear usuario y carpeta

```bash
adduser --disabled-password --gecos "" politicos
usermod -aG www-data politicos

mkdir -p /var/www/politicos
chown -R politicos:www-data /var/www/politicos
su - politicos
cd /var/www/politicos
```

## 3. Clonar y configurar Laravel

```bash
git clone <tu-repo-PoliticOS> backend
cd backend
composer install --no-dev --optimize-autoloader
cp .env.example .env
php artisan key:generate
php artisan storage:link
chown -R politicos:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache
```

`.env` mínimo de producción:

```env
APP_NAME=PoliticOS
APP_ENV=production
APP_KEY=base64:...  # generado
APP_URL=https://politicos.pe
APP_DEBUG=false

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_DATABASE=sistema_politicos
DB_USERNAME=politicos
DB_PASSWORD=********

QUEUE_CONNECTION=database
CACHE_STORE=redis
SESSION_DRIVER=redis
REDIS_HOST=127.0.0.1

GROQ_API_KEY=gsk_...
ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...   (opcional)

AI_PROVIDER=groq
GROQ_MODEL=llama-3.3-70b-versatile

AI_EMBEDDINGS_DRIVER=mysql_fulltext
# AI_EMBEDDINGS_DRIVER=qdrant   (cuando levantes docker compose ingest)
# QDRANT_URL=http://localhost:6333

# Tenant superadmin
SUPERADMIN_EMAIL=admin@politicos.pe
SUPERADMIN_PASSWORD=********
```

```bash
php artisan migrate
php artisan db:seed
php artisan optimize
```

## 4. Frontend Next.js

```bash
cd /var/www/politicos
git clone <tu-repo-frontend> frontend
cd frontend
npm install
cp .env.example .env.local
# editar NEXT_PUBLIC_API_URL=https://api.politicos.pe
npm run build

npm install -g pm2
pm2 start npm --name "politicos-web" -- start
pm2 save
pm2 startup
```

## 5. Nginx

`/etc/nginx/sites-available/politicos`:

```nginx
# API (multi-tenant por subdominio)
server {
    listen 443 ssl http2;
    server_name *.politicos.pe;
    root /var/www/politicos/backend/public;
    index index.php;

    ssl_certificate /etc/letsencrypt/live/politicos.pe/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/politicos.pe/privkey.pem;

    location /api/chat/stream {
        try_files $uri /index.php?$query_string;
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root/index.php;
        include fastcgi_params;
        # SSE: no bufferear
        fastcgi_buffering off;
        fastcgi_read_timeout 300;
        add_header X-Accel-Buffering no;
    }

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_read_timeout 180;
    }
}

# Frontend Next.js
server {
    listen 443 ssl http2;
    server_name politicos.pe www.politicos.pe;

    ssl_certificate /etc/letsencrypt/live/politicos.pe/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/politicos.pe/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass $http_upgrade;
    }
}

# Redirección HTTP → HTTPS
server {
    listen 80;
    server_name politicos.pe *.politicos.pe;
    return 301 https://$host$request_uri;
}
```

```bash
ln -s /etc/nginx/sites-available/politicos /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# TLS wildcard
certbot --nginx -d politicos.pe -d www.politicos.pe -d "*.politicos.pe"
# Requiere DNS challenge — sigue las instrucciones interactivas.
```

## 6. Queue worker (supervisor)

`/etc/supervisor/conf.d/politicos-worker.conf`:

```ini
[program:politicos-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/politicos/backend/artisan queue:work --queue=default --sleep=3 --tries=3 --max-time=3600
autostart=true
autorestart=true
user=politicos
numprocs=2
redirect_stderr=true
stdout_logfile=/var/log/politicos-worker.log
stopwaitsecs=3600
```

```bash
supervisorctl reread
supervisorctl update
supervisorctl start politicos-worker:*
```

## 7. Scheduler (cron)

```bash
crontab -e -u politicos
```

```
* * * * * cd /var/www/politicos/backend && php artisan schedule:run >> /dev/null 2>&1
```

## 8. (Opcional) Servicio Python con Docker

```bash
cd /var/www/politicos
git clone <tu-repo-ingest> ingest
# o copia la carpeta ingest/ del patch
cd ingest
cp .env.example .env
# editar .env con tokens reales
docker compose up -d
docker compose ps  # verificar que los 5 containers estén UP
```

## 9. Multi-tenant DNS

Para cada candidato:

1. Crea DB tenant: `CREATE DATABASE sistema_politicos_keiko CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
2. Agrega tenant via superadmin API: `POST /api/superadmin/tenants` con `{name, slug, db_name}`.
3. Crea registro DNS A → `keiko.politicos.pe` apuntando a IP del VPS.
4. Corre migraciones contra ese tenant.
5. Sube el plan de gobierno PDF desde `/admin/knowledge`.
6. Configura el perfil del candidato en `/admin/candidate-profile`.

## 10. Monitoring básico

- **Uptime:** UptimeRobot gratis (5 min check)
- **Logs:** `journalctl -u nginx`, `tail -f /var/log/politicos-worker.log`, `docker logs politicos-ingest-worker -f`
- **Métricas Laravel:** `/admin/intelligence/realtime` (en vivo cada 5s)

## 11. Backups

```bash
# /etc/cron.daily/politicos-backup
#!/bin/bash
DATE=$(date +%F)
mkdir -p /backups
mysqldump -u root -p<pass> --all-databases | gzip > /backups/db-$DATE.sql.gz
tar -czf /backups/uploads-$DATE.tar.gz /var/www/politicos/backend/storage/app/public
find /backups -mtime +14 -delete
```

```bash
chmod +x /etc/cron.daily/politicos-backup
```

## Costos finales estimados (mensual)

| Item | Costo |
|---|---|
| Hetzner CPX31 | €16 (~$17 USD) |
| Dominio .pe | ~$3/mes |
| Cloudflare | gratis |
| Let's Encrypt | gratis |
| Groq (chat + análisis) | ~$15 USD |
| Claude Haiku (fallback) | ~$10 USD |
| OpenAI embeddings (si Qdrant) | ~$3 USD |
| **Total mínimo** | **~$48 USD/mes** |
