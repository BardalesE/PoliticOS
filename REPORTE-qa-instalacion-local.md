# REPORTE — Instalación local + QA funcional (sin key de IA de pago)

Rama: `fix/qa-instalacion-local` (desde `main`). Todo probado en local (Windows/Laragon:
PHP 8.2.26, MySQL 8.0.30, Redis 5.0.14, Node 22), sin tocar producción/Vercel ni gastar
tokens de las API keys de pago (Groq/Claude/OpenAI vacías en `.env` local).

Contexto: se pidió dejar el proyecto corriendo en esta PC y revisar los flujos (público,
admin, superadmin, chatbot) para identificar bugs. No se hizo prueba de carga/estrés —
fuera de alcance por decisión explícita.

---

## Bugs encontrados y corregidos

### 1. (Crítico) Toda la API caía con 500 al usar `SESSION_DRIVER=redis`

**Síntoma:** cualquier request (incluso `GET /api/candidate`, público) devolvía 500:
```
Error: Call to undefined method Illuminate\Cache\SessionStore::setConnection()
  at .../Illuminate/Session/SessionManager.php:140
```

**Causa raíz:** `.env.example` trae `SESSION_STORE=session`, pero `config/cache.php` nunca
definía un store llamado `session` (solo `array`, `database`, `file`, `memcached`, `redis`,
`dynamodb`, `octane`). Laravel, al no encontrar ese store, interpreta el nombre `"session"`
como si fuera el *driver* interno `Illuminate\Cache\SessionStore` (pensado para tests, sin
soporte Redis) en vez de resolver el store de caché Redis dedicado a sesiones
(`REDIS_SESSION_DB`, ya definido en `config/database.php`). Como este `SessionStore` no
implementa `setConnection()`, `SessionManager::createRedisDriver()` revienta en cuanto
`SESSION_DRIVER=redis` — que es el valor por defecto de `.env.example`. Si producción usa
la misma combinación de env vars, este bug también la afecta.

**Fix aplicado** (`config/cache.php`): se agregó el store `session` faltante, apuntando a
la conexión Redis `session` que ya existía en `config/database.php`:
```php
'session' => [
    'driver' => 'redis',
    'connection' => env('REDIS_SESSION_CONNECTION', 'session'),
    'lock_connection' => env('REDIS_SESSION_LOCK_CONNECTION', 'default'),
],
```

**Verificación:** `GET /api/candidate` pasó de `500` a `200` inmediatamente tras el fix,
sin ningún otro cambio.

**Acción recomendada:** verificar si Vercel/Render tiene esta misma combinación de env vars
en producción (`SESSION_DRIVER=redis` + `SESSION_STORE=session`) — si es así, este mismo
500 puede estar ocurriendo ahí mismo ahora.

---

### 2. (Alto) El rate limiter comparte el mismo contador entre rutas no relacionadas

**Síntoma:** un login legítimo puede devolver `429 Too Many Attempts` sin que el usuario
haya intentado loguearse antes (reproducido en esta sesión).

**Causa raíz:** el middleware nativo de Laravel `throttle:N,M` genera la clave de caché con
`sha1($route->getDomain().'|'.$request->ip())` — **sin incluir la ruta**. Si no se pasa un
tercer parámetro (`prefix`), *todas* las rutas que usan `throttle:N,M` sin ese prefijo
comparten el mismo contador por IP+dominio, sin importar que tengan límites (`N`) distintos.
Antes del fix, estas 9 rutas compartían el contador entre sí:

| Ruta | Límite declarado |
|---|---|
| `POST /auth/login` | 5/min |
| `POST /chat/*` (todo el grupo) | 30/min |
| `POST /citizen/register` | 5/min |
| `GET /analytics/summary` | 20/min |
| `POST /livestreams/{key}/ping` | 60/min |
| `POST /livestreams/{key}/comments` | 15/min |
| `POST /admin/external-signals/ingest` | 60/min |
| `GET /ingest/entities` | 30/min |
| `POST /admin/surveys/sync` | 30/min |
| `/superadmin/*` (todo el grupo) | 30/min |

Ejemplo real de impacto: un ciudadano que manda 5 mensajes al chat (`throttle:30,1`) y
luego intenta registrarse (`throttle:5,1,` mismo contador) se encuentra el registro ya
bloqueado — nunca lo había intentado. Mismo problema entre tráfico público del chat y el
panel de SuperAdmin si comparten IP (NAT de oficina, redes móviles con CGNAT — muy común en
Perú).

**Fix aplicado** (`routes/api.php`): se agregó un `prefix` único a cada uno de los 9 usos de
`throttle:` para que cada ruta tenga su propio contador independiente
(`throttle:5,1,login`, `throttle:30,1,chat`, `throttle:5,1,citizen-register`, etc.).

**Verificación:** `php -l routes/api.php` sin errores; `php artisan route:list` sigue
resolviendo todas las rutas; probado manualmente login aislado → `200`.

---

### 3. (Bajo) `.gitignore` no cubría `.env.testing` / `.env.staging`

Solo estaban `.env`, `.env.backup`, `.env.production`. Se agregaron los dos que faltaban
para evitar que se filtren por accidente (hay un pre-commit hook escaneando secretos, pero
mejor no depender solo de eso).

---

## Hallazgos documentados (no corregidos — requieren decisión de producto o más pruebas)

### 4. (Medio) `POST /admin/proposals` (y probablemente otros `store`/`update`) devuelve
`302` HTML en vez de `422` JSON si el cliente no manda `Accept: application/json`

Confirmado con `curl` sin ese header: la app redirige (comportamiento nativo de Laravel
para `ValidationException` cuando `$request->expectsJson()` es `false`). El propio
`bootstrap/app.php` deja pasar `ValidationException` sin envolver, con este comentario:
> "ValidationException y HttpResponseException se dejan pasar (return null) porque Laravel
> ya les da un manejo correcto por su cuenta" — cierto solo si el cliente manda el header.

**Por qué no lo toqué:** confirmé que `resources/js/src/lib/api.ts` sí manda
`Accept: application/json` en todos sus fetch (líneas ~87, ~135, ~845), así que **el sitio
real no está afectado hoy**. Pero cualquier otro consumidor (Postman sin configurar,
el servicio de ingest en Python, un futuro cliente móvil) sí lo sufriría. El reporte
`REPORTE-fix-seguridad-navegacion.md` ya tocó este mismo `render()` para otras excepciones
y decidió conscientemente no envolver `ValidationException` — cualquier cambio acá debería
repetir esa verificación exhaustiva (login, todos los `store`/`update` con validación,
`php artisan test`) antes de tocarlo, así que lo dejo para una tarea aparte.

### 5. (Medio/Alto) `DELETE /api/superadmin/tenants/{id}` no borra la base de datos física del tenant

`SuperAdminController::destroyTenant()` solo hace `Tenant::findOrFail($id)->delete()` — el
registro central desaparece, pero la respuesta `{"deleted":true}` es engañosa: la BD MySQL
completa del tenant (candidate_profiles, chat_sessions, **citizen_profiles con teléfonos y
ubicaciones reales**, etc.) queda huérfana en el servidor indefinidamente. Reproducido:
provisioné un tenant de prueba (`qa-test`), lo borré vía API, y `SHOW DATABASES` seguía
listando `bdpolitic_qa_test` con todas sus tablas intactas (tuve que hacer `DROP DATABASE`
manual).

No apliqué un fix porque la solución correcta depende de una decisión de producto que no me
corresponde tomar unilateralmente (¿purgar inmediatamente? ¿exportar/backup antes de
borrar? ¿exigir una confirmación explícita `?purge=true` dado que es irreversible?) — y
automatizar un `DROP DATABASE` sin ese criterio es riesgoso. Dado que la plataforma guarda
datos personales de ciudadanos, esto también tiene implicancia de privacidad/retención de
datos si algún día un candidato pide que se elimine su campaña.

### 6. (Bajo/Doc) Onboarding: un clon 100% limpio en modo multi-tenant se rompe con la
config por defecto de `.env.example`

`DatabaseSeeder` no crea ningún tenant (solo usuario admin, ai-setting, settings, planes).
Si alguien clona el repo, sigue el README al pie de la letra (`migrate --seed`) y **no**
vacía `APP_TENANT_SLUG` (que trae `james` por defecto), `ResolveTenant` responde
`404 Tenant no encontrado` en absolutamente todo, porque no existe ningún tenant `james` en
una base de datos recién creada. En esta PC no se manifestó porque la BD `bdpolitic` ya
tenía un tenant `james` de una sesión previa — en un entorno 100% limpio si aparecería.
Sugerido para `CLAUDE.md`/README: aclarar que tras un `migrate --seed` fresco hay que
correr `php artisan tenant:provision ...` o dejar `APP_TENANT_SLUG` vacío.

### 7. (Bajo/Doc) La suite de tests asume una BD de test ya migrada

Varios tests (`ExternalSignalEntitiesTest`, etc.) usan `DatabaseTransactions` (no
`RefreshDatabase`), lo que asume que el esquema ya existe en la BD de test. No hay
`.env.testing` de ejemplo ni mención en `CLAUDE.md` de que hay que migrarla antes de
`php artisan test`. Se creó un `.env.testing` local (gitignorado, no se sube) apuntando a
`bdpolitic_test` para no arriesgar la BD de desarrollo — recomendable documentarlo o
commitear un `.env.testing.example`.

---

## Lo que se probó y funcionó bien (sin bugs)

- **Multi-tenancy end-to-end:** `php artisan tenant:provision` probado completo (crea BD,
  63 migraciones, siembra, registra tenant) — login y API del tenant nuevo funcionando con
  `?tenant=slug` y aislado del resto.
- **SuperAdmin:** 403 sin key, 200 con `X-Super-Admin-Key` correcta, listado de tenants y
  planes correcto.
- **Admin CRUD:** creación/edición/borrado de `proposals` y `faqs` probado end-to-end;
  protección "no puedes eliminarte a ti mismo" (`EnsureIsAdmin`/`AdminController`)
  confirmada (`422` al intentarlo).
- **25 endpoints públicos y de admin** revisados por HTTP status — todos `200`.
- **Chatbot:** sin key de IA configurada, cae correctamente por la cascada
  Groq → Claude → OpenAI (los tres devuelven 401 controladamente, quedó logueado) y
  degrada con una respuesta de fallback amigable en vez de romperse. La lógica de IA está
  bien cableada; falta una key real para validar respuestas generadas (ver nota abajo).
- **Frontend:** las 8 páginas públicas + `/admin/login` compilan y cargan sin errores de
  consola ni warnings en el log de Next.js.
- **`php artisan test`: 23/23 passed** (70 assertions), incluido `PepaResponseParsingTest`
  que cubre el parseo frágil de JSON que `CLAUDE.md` marca como riesgo conocido.

## Pendiente (requiere acción del usuario)

Para probar el chatbot con respuestas reales generadas por IA hace falta una API key. Se
recomendó crear una **key gratuita de Groq** (console.groq.com/keys, sin tarjeta) para no
tocar los tokens de pago de producción — pendiente de que el usuario la genere y la
comparta si quiere esa prueba adicional.
