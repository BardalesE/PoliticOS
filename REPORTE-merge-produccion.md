# Reporte — Merge a producción (2026-07-11)

Consolidación de 3 ramas revisadas a `main`, una por una, con verificación después
de cada push (cada push a `main` dispara deploy real: Vercel frontend + Render backend).

## Orden de merge

1. `feature/home-tabs-editorial` → `main` (commit `88ef3a5`)
2. `fix/seguridad-post-qa` → `main` (commit `4470675`)
3. `feature/chat-microfono` → `main` (commit `b2ceb82`)

Todos los merges se hicieron con `--no-ff` y sin necesidad de resolver conflictos —
las tres ramas tocaban archivos disjuntos (la preocupación inicial sobre
`next.config.js` y `bootstrap/app.php` no se materializó: `feature/home-tabs-editorial`
nunca tocó esos archivos, solo `fix/seguridad-post-qa` lo hizo).

---

## Paso 0 — Verificación previa con TestSprite

Contra el preview de `feature/home-tabs-editorial` (usando el build local de
producción de esa misma rama, ya que TestSprite solo puede testear un servidor
local, no una URL de Vercel arbitraria):

- **Barra de pestañas a 360px:** ✅ Passed directamente por TestSprite (TC009).
- **OpinionModal (abrir/cerrar):** TestSprite reportó fallo/bloqueo en 4 tests
  (TC004, TC006, TC007, TC008), pero por un **falso negativo** de su propio
  agente: buscó texto "opinión"/"opinar" en la página, y el botón real dice
  *"Dile qué necesita tu caserío"* (nunca contiene esas palabras), así que
  nunca lo encontró pese a que el botón sí está presente y renderizado
  server-side.
  - Se confirmó de forma independiente con un script Playwright real contra
    el mismo servidor local: el botón abre el modal; se cierra con Escape,
    con click fuera del panel, y con el botón "X" explícito; clickear dentro
    del panel (ej. un input) **no** lo cierra. Resultado: `opens`,
    `escapeCloses`, `backdropCloses`, `insideClickKeepsOpen`,
    `explicitCloseWorks` — todos `true`.
  - También se reconfirmó el layout a 360px: `navIsScrollable: true`,
    `bodyNoHorizontalOverflow: true` (`scrollWidth === clientWidth === 360`).

Ambos puntos pendientes quedaron confirmados antes de tocar `main`.

---

## Paso 1 — `feature/home-tabs-editorial`

- Merge sin conflictos.
- `npx tsc --noEmit` → limpio.
- `npm run build` (Next.js) → exitoso, 41 rutas generadas.
- `php artisan test` → 23 tests, todos en verde.
- Push a `origin/main` → `88ef3a5`.

## Paso 2 — `fix/seguridad-post-qa`

- Merge sin conflictos (incluye una migración nueva,
  `2026_07_10_150000_add_api_key_to_ai_settings`, ya aplicada localmente).
- Se verificó explícitamente que `next.config.js` (headers de seguridad/CSP) y
  `bootstrap/app.php` (renderer JSON global + orden de `ResolveTenant` antes de
  `auth:sanctum`) quedaron intactos y sin choque con la rama anterior.
- `npx tsc --noEmit` → limpio.
- `npm run build` → exitoso.
- `php artisan test` → 23 tests en verde, incluyendo el suite completo de
  `PepaResponseParsingTest` (crítico porque esta rama modificó
  `CivicAIService` y los prompts).
- Push a `origin/main` → `4470675`.

## Paso 3 — `feature/chat-microfono`

- Merge sin conflictos.
- `npx tsc --noEmit` → limpio.
- `npm run build` → exitoso.
- Push a `origin/main` → `b2ceb82`.

---

## Paso 4 — Verificación post-deploy en producción

Se esperó a que Vercel (`politic-os`, alias `politic-os-beta.vercel.app`) y
Render (`politicos-api.onrender.com`) terminaran de desplegar el commit final
(`b2ceb82`). Confirmado vía API de Vercel que el deployment `dpl_5fSGSi8kQewkQQkXL2MHy6rhBpqc`
quedó `READY` con ese commit y el alias de producción apuntando a él.

1. **`GET /api/candidate` con `X-Tenant: rigo`** (Render):
   `200 OK`, JSON limpio, con headers de seguridad de `fix/seguridad-post-qa`
   presentes (CSP, `X-Frame-Options`, rate limiting `x-ratelimit-*`).
   - Se aprovechó para confirmar que el fix del renderer JSON global quedó
     realmente desplegado (no solo mergeado): `GET /api/no-existe-esto` →
     `404` JSON limpio (antes habría podido filtrar stack trace/redirect), y
     `GET /api/chat` (método no soportado) → `405` JSON limpio.
2. **Home real de `rigo`** (`politic-os-beta.vercel.app/?tenant=rigo`):
   `200 OK`, `<title>Habla con Rigoberto — San Gregorio</title>`, y las
   pestañas del diseño nuevo presentes en el HTML (`Propuestas`,
   `Lugares Visitados`, `Base del Conocimiento`, etc.).
3. **Chat de `rigo`** (`POST /api/chat` en Render, con la key real del
   tenant): `200 OK` con una respuesta generada real del asistente
   (modo `pepa`, `sessionId` válido, sin errores). Confirma que el pipeline
   `CivicAIService` con los prompts reforzados contra jailbreak sigue
   funcionando end-to-end en producción.

**Nota técnica descubierta en el camino:** un `POST /api/chat` sin header
`Accept: application/json` dispara un redirect 302 a la raíz del dominio en
vez de un error JSON — es el comportamiento por defecto de Laravel para
`ValidationException` en apps sin ruta `login` (mismo origen que el bug que
`fix/seguridad-post-qa` corrigió para `RouteNotFoundException`/
`MethodNotAllowedException`/`ThrottleRequestsException`, pero `ValidationException`
no estaba en esa lista). El frontend real siempre manda `Accept: application/json`
en sus llamadas (`lib/api.ts`), así que esto no afecta a usuarios reales — se
menciona aquí como hallazgo, no como bloqueo.

---

## Confirmación final

**Producción quedó sana.** Los tres merges se completaron en orden, sin
conflictos, con todas las verificaciones locales en verde antes de cada push,
y las tres comprobaciones post-deploy (API, home, chat) respondieron
correctamente contra el backend y frontend reales.
