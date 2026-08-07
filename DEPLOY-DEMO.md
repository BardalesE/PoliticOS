# DEPLOY-DEMO — PoliticOS en Vercel + Render + Railway (sin Redis, sin ingest)

Guía paso a paso para levantar una **demo** del chatbot (mostrar a un candidato).
No requiere experiencia DevOps. Tiempo estimado: 45–60 min.

**Arquitectura de la demo**

| Pieza | Dónde | Qué |
|---|---|---|
| Frontend Next.js 15 | Vercel | La web pública + panel admin |
| Backend Laravel 12 | Render (Docker, `Dockerfile` de la raíz) | API REST + chat SSE |
| Base de datos | Railway | **MySQL 8 real** (el RAG usa `MATCH ... AGAINST`, FULLTEXT — por eso NO Postgres) |
| Redis | — | **No hay.** Colas `sync`, cache `file`, sesiones `database` |
| Ingesta Python | — | **Apagada.** La inteligencia electoral queda en pausa |

Archivos que usa esta guía (todos nuevos, ninguno del código original fue tocado):
`Dockerfile`, `.dockerignore`, `render.yaml`, `.env.render.example`,
`deploy/render/*` (nginx, supervisord, entrypoint), `resources/js/vercel.json`.

---

## Parte A — MySQL 8 en Railway (dos schemas: central + tenant)

### A.1 Crear la base

1. Entra a [railway.app](https://railway.app) → **New Project** → **Deploy MySQL**.
2. Cuando arranque, abre el servicio MySQL → pestaña **Variables** (o **Connect**)
   y copia:
   - `MYSQLHOST` **público** (algo como `yamanote.proxy.rlwy.net` — usa el del
     TCP proxy de la pestaña *Connect*, NO `mysql.railway.internal`)
   - `MYSQLPORT` público (un puerto raro tipo `34567`, NO 3306)
   - `MYSQLUSER` (normalmente `root`)
   - `MYSQLPASSWORD`
   - `MYSQLDATABASE` (Railway crea un schema llamado `railway`)

### A.2 Entender los dos schemas (importante)

PoliticOS usa **dos bases en el mismo servidor MySQL**:

- **Schema central** = el que apunta `DB_DATABASE` (usa el `railway` que ya
  existe). Aquí viven las tablas `tenants` y `plan_features`.
  Ojo: la conexión `central` de `config/database.php` lee las **mismas**
  variables `DB_*` — central y "BD por defecto" son el mismo schema.
  Por eso **no existe** un comando `migrate --database=central` separado:
  un solo `php artisan migrate` cubre ambas conexiones.
- **Schema del tenant** (ej. `bdpolitic_demo`) = el contenido del candidato
  (propuestas, chat, knowledge...). Lo crea y registra el comando
  `tenant:provision` en el paso A.4.

### A.3 Migrar y sembrar el schema central (desde tu PC)

Desde la raíz del repo, en **PowerShell** (las variables de entorno de la
sesión tienen prioridad sobre tu `.env` local, así no tocas ningún archivo):

```powershell
$env:DB_HOST     = "TU_HOST_PUBLICO.proxy.rlwy.net"
$env:DB_PORT     = "TU_PUERTO_PUBLICO"
$env:DB_DATABASE = "railway"
$env:DB_USERNAME = "root"
$env:DB_PASSWORD = "TU_PASSWORD_DE_RAILWAY"

php artisan migrate --force
php artisan db:seed --force
```

El seed crea el usuario admin base (`admin@politicos.pe` / `Admin2024!` —
cámbialo luego), la config de IA y los planes (`plan_features`).

### A.4 Crear el tenant de la demo

En la **misma sesión** de PowerShell (con las variables aún puestas):

```powershell
php artisan tenant:provision demo "Candidato Demo" bdpolitic_demo admin@demo.pe "UnPasswordFuerte123!" `
  --db-host=TU_HOST_PUBLICO.proxy.rlwy.net `
  --db-port=TU_PUERTO_PUBLICO `
  --db-user=root `
  --db-password=TU_PASSWORD_DE_RAILWAY `
  --plan=elite `
  --force
```

Esto: crea el schema `bdpolitic_demo`, corre sus migraciones, siembra datos
iniciales y registra la fila en `tenants` **con esas credenciales de Railway**
(no omitas los `--db-*`: si no, guarda `127.0.0.1` y Render no podrá conectar).

- `demo` = el slug → va en `APP_TENANT_SLUG` en Render.
- `admin@demo.pe` / password = el login del panel admin del candidato.
- `--plan=elite` habilita todas las features en la demo.

### A.5 Generar la APP_KEY

```powershell
php artisan key:generate --show
```

Copia el resultado completo (empieza con `base64:`) — lo pegarás en Render.

---

## Parte B — Backend Laravel en Render

### B.1 Crear el servicio

Opción recomendada (Blueprint):

1. Sube el repo a GitHub (si no está).
2. [render.com](https://render.com) → **New** → **Blueprint** → conecta el repo.
   Render lee `render.yaml` y crea el servicio `politicos-api` con el
   `Dockerfile` de la raíz.
3. Render te pedirá los valores `sync: false` (secretos). Usa
   **`.env.render.example`** como chuleta: ahí está cada variable comentada
   con de dónde sale su valor.

Opción manual: **New → Web Service → runtime Docker**, Dockerfile Path
`./Dockerfile`, Health Check Path `/up`, y pega a mano las variables de
`.env.render.example` en la pestaña *Environment*.

Variables mínimas que SÍ o SÍ debes rellenar:

| Variable | Valor |
|---|---|
| `APP_KEY` | lo generado en A.5 |
| `DB_HOST` / `DB_PORT` / `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` | credenciales de Railway (schema `railway`) |
| `APP_TENANT_SLUG` | `demo` (el slug de A.4) |
| `ANTHROPIC_API_KEY` | tu key de console.anthropic.com |
| `FRONTEND_URL` | la URL de Vercel (la tendrás en la Parte C; puedes volver a ponerla después) |
| `SUPER_ADMIN_KEY` / `INGEST_KEY` | aleatorias fuertes (`openssl rand -hex 32`; el Blueprint las genera solo) |

Sobre el **plan**: `render.yaml` pide `starter` con un disco persistente de
1 GB montado en `storage/app/public` (los uploads sobreviven deploys). El plan
**free** también funciona para la demo, pero: no admite discos (uploads
efímeros) y el servicio **se duerme** tras ~15 min de inactividad (el primer
request tarda ~50 s). Para el día de la demo con el candidato: usa starter o
abre la web 5 minutos antes.

### B.2 Qué hace el contenedor al arrancar (por si algo falla)

`deploy/render/entrypoint.sh` ejecuta en orden: `storage:link` →
`config:cache` → `route:cache` → `php artisan migrate --force` (idempotente;
un warning si ya corrió, nunca tumba el arranque) → `db:seed` solo si
`RUN_SEED=true` → nginx escuchando en `$PORT` (Render lo inyecta) + php-fpm.
El streaming SSE del chat ya está contemplado (`fastcgi_buffering off`).

Como ya migraste/sembraste desde tu PC en la Parte A, deja `RUN_SEED=false`.

### B.3 Verificar

1. Render → Logs: debes ver `[entrypoint] PORT=...` y luego nginx/php-fpm arriba.
2. Abre `https://TU-SERVICIO.onrender.com/up` → página con **200 OK**.
3. Prueba la API: `https://TU-SERVICIO.onrender.com/api/candidate` →
   JSON del perfil del tenant `demo` (si devuelve "Tenant no encontrado",
   revisa `APP_TENANT_SLUG` y que A.4 haya terminado bien).

---

## Parte C — Frontend Next.js en Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → importa el repo.
2. **Root Directory: `resources/js`** ← el paso que todos olvidan.
   (Ahí ya hay un `vercel.json` con `framework: nextjs`; Vercel detecta
   build/output solos.)
3. En **Environment Variables** del proyecto:

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://TU-SERVICIO.onrender.com/api` (con `/api`, sin slash final) |
   | `NEXT_PUBLIC_USE_MOCK` | `false` |
   | `NEXT_PUBLIC_TENANT_SLUG` | `demo` (opcional; manda el header `X-Tenant` — redundante con `APP_TENANT_SLUG`, pero explícito) |

4. **Deploy**. Nota: `next.config.js` ya añade el host del backend a los
   dominios permitidos de imágenes derivándolo de `NEXT_PUBLIC_API_URL` —
   no hay que tocar nada.
5. Copia la URL final (ej. `https://politicos-demo.vercel.app`).

---

## Parte D — Conectar CORS y dominios

`config/cors.php` (real, del repo) permite orígenes por dos vías:

1. **`FRONTEND_URL`** → match **exacto** contra el origen. Debe ser
   `https://politicos-demo.vercel.app` — con `https://`, **sin** slash final.
2. **`CORS_ALLOWED_PATTERN`** → regex de `preg_match`, **con delimitadores**.
   Útil para cubrir los preview-deploys de Vercel:
   `#^https://[a-z0-9-]+\.vercel\.app$#`

En Render → Environment, setea/actualiza:

```
FRONTEND_URL=https://politicos-demo.vercel.app
SANCTUM_STATEFUL_DOMAINS=politicos-demo.vercel.app
CORS_ALLOWED_PATTERN=#^https://[a-z0-9-]+\.vercel\.app$#   (opcional)
```

Guarda → Render redespliega (necesario: el entrypoint cachea la config al
arrancar). Nota: el login admin usa **Bearer token** (localStorage), no
cookies de sesión, así que `SANCTUM_STATEFUL_DOMAINS` es poco crítico en la
demo, pero déjalo bien puesto.

**Prueba fin-a-fin**: abre la URL de Vercel → chat → manda un mensaje →
debe streamear la respuesta. Panel admin: `/admin/login` con
`admin@demo.pe` y el password de A.4.

---

## Parte E — Checklist de seguridad (demo)

- [ ] `APP_DEBUG=false` y `APP_ENV=production` en Render (nunca stack traces públicos).
- [ ] `APP_KEY` única generada para esta demo (no reusar la de local).
- [ ] `SUPER_ADMIN_KEY` e `INGEST_KEY` aleatorias de 32+ chars (`openssl rand -hex 32`). No las compartas; **no muestres `/superadmin` en la demo** ni difundas su URL.
- [ ] Password del admin del tenant fuerte (el de A.4) y cambiado el del seed central (`admin@politicos.pe / Admin2024!`) o ignora ese usuario: vive en el schema central, no en el del tenant.
- [ ] HTTPS: automático en Render y Vercel, nada que hacer.
- [ ] El password de MySQL de Railway solo vive en Render (env vars) — no lo commitees en ningún archivo.
- [ ] Keys de IA (`ANTHROPIC_API_KEY`...) solo como env vars en Render.

---

## Parte F — Limitaciones conocidas de esta demo

- **Sin Redis → colas `sync`**: los jobs (`AnalyzeMessageJob`, geolocalización,
  etc.) corren en línea dentro del request o simplemente no se agendan. El chat
  funciona; puede sentirse algo más lento por mensaje.
- **Sin cron/scheduler en el contenedor**: los jobs programados de
  `routes/console.php` (alertas, clustering) no corren. Para producción:
  Render Cron Job que ejecute `php artisan schedule:run`.
- **Sin servicio Python de ingesta**: las pantallas de inteligencia electoral
  (pulso, ataques, señales externas) estarán vacías o con datos históricos.
  Es esperado; no lo muestres o preséntalo como "módulo pro".
- **Media**: con el disco de `render.yaml` (plan starter) los uploads persisten.
  En plan free son **efímeros** (se pierden en cada deploy) — sube las fotos
  de la demo justo antes, o usa `MEDIA_DISK=s3`.
- **Plan free de Render duerme**: primer request ~50 s. Calienta la app antes
  de la reunión (`/up`).
- **RAG**: `AI_EMBEDDINGS_DRIVER=mysql_fulltext` (FULLTEXT de MySQL 8, sin
  Qdrant). Funciona bien para volúmenes de demo. Recuerda cargar documentos
  en Admin → Knowledge y reindexar para que el chat tenga contexto.
- Los arreglos de seguridad "críticos" del informe de auditoría se hacen
  **antes de clientes reales**; para esta demo controlada no bloquean.

---

## Notas para el dueño (cambios de código que NO hice)

Regla respetada: **cero archivos existentes modificados**; todo lo de arriba
son archivos nuevos. Estas mejoras requerirían tocar código y quedan anotadas:

1. **La conexión `central` no tiene variables propias** — en
   `config/database.php` lee las mismas `DB_*` que la conexión por defecto
   (`'database' => env('DB_DATABASE', ...)`). Hoy central = schema por defecto,
   lo cual está bien para la demo. Si algún día quieres la central en otro
   schema/servidor, habría que introducir `DB_CENTRAL_DATABASE` (y afines) en
   ese archivo.
2. **`CORS_ALLOWED_PATTERN` sin delimitadores en `.env.production.example`** —
   ese ejemplo (`https://([a-z0-9-]+\.)?politicos\.pe`) no matchea nunca:
   `config/cors.php` pasa el patrón directo a `preg_match`, que exige
   delimitadores (los patrones de dev del mismo archivo sí los llevan: `#...#`).
   No edité el example; usa siempre la forma `#^https://...$#` como en esta guía.
3. **No hay scheduler ni worker en el contenedor** — decisión de demo, no bug.
   Para producción en Render: un Cron Job (`php artisan schedule:run` cada
   minuto) y, si vuelve Redis, un Background Worker (`php artisan queue:work`).
4. **`tenant:provision` guarda el password de la BD en texto plano** en la
   tabla `tenants` (así está diseñado hoy). En Railway/demo es aceptable;
   para producción real conviene cifrarlo (cast `encrypted` en el modelo).
5. **Streaming SSE**: el nginx del contenedor desactiva el buffering
   globalmente para PHP (API pura, sin costo). El `deploy/nginx.conf` del VPS
   solo lo hace por ruta; no lo toqué.
