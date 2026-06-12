# Instalación — PoliticOS v2

Tiempo estimado: **45–60 min** (sin contar build de ingest Python que es opcional).

## Prerrequisitos

- Proyecto PoliticOS v1 funcionando local o en VPS.
- PHP 8.2+, Composer, Node 20+, MySQL 8.0+ (InnoDB + FULLTEXT).
- Bearer token de un usuario admin (lo usaremos para el servicio Python).

---

## PASO 1 — Backup

```bash
# En el server (o local):
cd /ruta/al/proyecto/PoliticOS
git checkout -b feature/v2-patch
# o copia el proyecto a una carpeta nueva si no usas git
mysqldump -u USER -p sistema_politicos > backup-pre-v2.sql
```

---

## PASO 2 — Copiar archivos backend

Desde la raíz del proyecto Laravel:

```bash
# Modelos nuevos
cp /ruta/politicos-v2-patch/backend/app/Models/*.php app/Models/

# Servicios (sobreescribe JamesAIService — guarda copia si tienes custom)
cp /ruta/politicos-v2-patch/backend/app/Services/*.php app/Services/

# Jobs
cp /ruta/politicos-v2-patch/backend/app/Jobs/*.php app/Jobs/

# Middleware
cp /ruta/politicos-v2-patch/backend/app/Http/Middleware/CaptureRequestContext.php app/Http/Middleware/

# Controllers (sobreescribe ChatController y KnowledgeDocumentController)
cp /ruta/politicos-v2-patch/backend/app/Http/Controllers/*.php app/Http/Controllers/

# Providers
cp /ruta/politicos-v2-patch/backend/app/Providers/AppServiceProvider.php app/Providers/

# Migraciones (10 archivos)
cp /ruta/politicos-v2-patch/backend/database/migrations/*.php database/migrations/

# Seeders
cp /ruta/politicos-v2-patch/backend/database/seeders/*.php database/seeders/

# Routes
cp /ruta/politicos-v2-patch/backend/routes/api.php routes/api.php
cp /ruta/politicos-v2-patch/backend/routes/console.php routes/console.php

# Config
cp /ruta/politicos-v2-patch/backend/config/services.php config/services.php

# Prompt maestro
mkdir -p resources/prompts
cp /ruta/politicos-v2-patch/backend/resources/prompts/politicos_v2_prompt.txt resources/prompts/
```

---

## PASO 3 — Variables de entorno (.env)

Agregar al final del `.env`:

```bash
# ── AI Embeddings driver ────────────────────
AI_EMBEDDINGS_DRIVER=mysql_fulltext
# Cuando levantes Qdrant, cambia a:
# AI_EMBEDDINGS_DRIVER=qdrant
# QDRANT_URL=http://localhost:6333
# OPENAI_API_KEY=sk-...

# ── GeoIP (opcional) ────────────────────────
# MAXMIND_DB_PATH=/opt/geoip/GeoLite2-City.mmdb

# ── Queue worker (REQUERIDO) ────────────────
QUEUE_CONNECTION=database
# o redis si ya lo tienes
```

---

## PASO 4 — Por CADA tenant (DB)

Para cada base de datos de tenant (sistema_politicos, sistema_politicos_keiko, etc.):

```bash
# Conectar al tenant manualmente o usar el comando custom
php artisan migrate --database=tenant_DEFAULT_KEY
php artisan db:seed --database=tenant_DEFAULT_KEY --class=DatabaseSeederV2
```

Si el sistema tiene helper de tenant CLI:

```bash
php artisan tenant:migrate keiko
php artisan tenant:seed keiko DatabaseSeederV2
```

**Si NO tienes ese helper, conecta manualmente:**

```bash
# Editar config/database.php → connection 'tenant' temporalmente apuntando a la DB del tenant
# o usa este snippet desde tinker:
php artisan tinker
>>> config(['database.connections.tenant.database' => 'sistema_politicos_keiko']);
>>> DB::purge('tenant');
>>> Artisan::call('migrate', ['--database' => 'tenant', '--force' => true]);
>>> Artisan::call('db:seed', ['--class' => 'DatabaseSeederV2', '--database' => 'tenant', '--force' => true]);
```

---

## PASO 5 — Frontend

```bash
cd resources/js   # o donde esté tu Next.js

# Componentes nuevos
mkdir -p src/components/chat
cp /ruta/politicos-v2-patch/frontend/src/components/chat/*.tsx src/components/chat/

# Páginas admin nuevas
mkdir -p src/app/admin/intelligence
mkdir -p src/app/admin/attack-responses
mkdir -p src/app/admin/external-signals
cp /ruta/politicos-v2-patch/frontend/src/app/admin/intelligence/page.tsx src/app/admin/intelligence/
cp /ruta/politicos-v2-patch/frontend/src/app/admin/attack-responses/page.tsx src/app/admin/attack-responses/
cp /ruta/politicos-v2-patch/frontend/src/app/admin/external-signals/page.tsx src/app/admin/external-signals/

# Chat reemplazado
cp /ruta/politicos-v2-patch/frontend/src/app/chat/page.tsx src/app/chat/page.tsx

# Sidebar v2 (renómbralo a Sidebar.tsx si tu layout lo importa así)
cp /ruta/politicos-v2-patch/frontend/src/components/admin/SidebarV2.tsx src/components/admin/

# Instalar dep nueva si falta
npm install framer-motion lucide-react recharts

# Build
npm run build
```

---

## PASO 6 — Queue worker (REQUERIDO para análisis async)

Sin esto, los mensajes se guardan pero NO se analizan emocionalmente.

```bash
# En el VPS, con supervisor:
sudo nano /etc/supervisor/conf.d/politicos-worker.conf
```

```ini
[program:politicos-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/PoliticOS/artisan queue:work --queue=default --sleep=3 --tries=3 --max-time=3600
autostart=true
autorestart=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/var/log/politicos-worker.log
stopwaitsecs=3600
```

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start politicos-worker:*
```

## PASO 7 — Scheduler (REQUERIDO para alertas y clustering)

```bash
sudo crontab -e -u www-data
```

```cron
* * * * * cd /var/www/PoliticOS && php artisan schedule:run >> /dev/null 2>&1
```

---

## PASO 8 — Smoke test

```bash
# 1. Backend health
curl http://localhost:8000/api/candidate

# 2. Chat sin login
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"¿Cuál es tu plan para la seguridad?","consent":true}'

# 3. Esperar ~5 segundos y revisar análisis async:
php artisan tinker
>>> App\Models\ChatMessage::latest()->first()
# Debería tener sentiment, emotion, intent rellenos

# 4. Abrir dashboard
# https://tu-dominio/admin/intelligence (con login admin)
```

---

## PASO 9 — (OPCIONAL) Servicio Python de ingesta

Solo si quieres feed de noticias/redes externas alimentando el dashboard.

```bash
cd /ruta/politicos-v2-patch/ingest
cp .env.example .env
# Editar .env: LARAVEL_ADMIN_TOKEN, RSS_FEEDS, GROQ_API_KEY
docker compose up -d

# Verificar
curl http://localhost:8001/health
docker logs politicos-ingest-worker -f

# Disparar carga inicial manual
curl -X POST http://localhost:8001/ingest/now \
  -H "Content-Type: application/json" \
  -d '{"sources":["rss"]}'
```

A los pocos minutos, las señales deberían aparecer en `/admin/external-signals` y reflejarse en el dashboard de inteligencia.

---

## PASO 10 — (OPCIONAL) Activar Qdrant para RAG vectorial

Si levantaste el docker-compose, Qdrant ya está corriendo en `localhost:6333`.

```bash
# En .env del Laravel:
AI_EMBEDDINGS_DRIVER=qdrant
QDRANT_URL=http://localhost:6333
OPENAI_API_KEY=sk-...

# Reindexar todos los documentos
php artisan tinker
>>> App\Models\KnowledgeDocument::where('is_active', true)->each(function ($d) {
...   app(\App\Services\EmbeddingsServiceInterface::class)->index($d->id, $d->content, ['title' => $d->title, 'topic' => $d->topic]);
... });
```

---

## Troubleshooting

**"Class 'GeoIp2\Database\Reader' not found"** → no levantaste MaxMind (opcional). El sistema usa fallback ip-api.com.

**"FULLTEXT not created"** → tu MySQL no soporta FULLTEXT en InnoDB (versión < 5.6). El driver tiene fallback automático a LIKE.

**Mensajes no se analizan** → el queue worker no está corriendo. `php artisan queue:work` para probar localmente.

**Alertas no se generan** → cron de scheduler no está activo. Verifica con `php artisan schedule:list`.

**Frontend rompe en /admin/intelligence** → falta `framer-motion`, `recharts` o `lucide-react`. `npm install` las tres.
