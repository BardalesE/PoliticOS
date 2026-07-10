# REPORTE — Ampliación de Fase 2: video en Hero, Galería unificada, Lugares Visitados, doble vía

Rama: `feature/candidate-home-redesign` — sin commitear, sin push. Continúa
directamente sobre el trabajo de `REPORTE-fase-home-candidato.md` (punch
list de 10 ítems, ya commiteado localmente en esa misma rama).

Fecha: 2026-07-09.

---

## Hallazgo antes de empezar

Al conectar el repo real se confirmó que **Fase 1 (sistema de diseño),
URGENTE2 (fuga de datos), PREP (endpoint knowledge) y la Fase 2 original de
10 ítems ya estaban hechas y commiteadas localmente**, esperando revisión
(`REPORTE-fase-home-candidato.md`). Este reporte cubre solo lo nuevo:
cuatro piezas decididas en la sesión de diseño del 9 de julio.

## 1. Hero en modo video — sin cambios de código necesarios ✅

`Hero.tsx` ya soportaba `video_url` con fallback a imagen y overlay
degradado (`autoPlay muted loop playsInline`, `onError` cae a imagen). El
backend también ya tenía el campo (`HeroSettings.video_url`) y el endpoint
de subida (`/admin/hero-settings/upload-video`). Es 100% contenido: subir
el video desde `/admin/hero-settings`.

## 2. `MediaSection.tsx` → Galería unificada ✅

Antes: dos marquees separados (fotos / videos). Ahora: un solo feed
cronológico (`FeedTrack`/`FeedCard`) que mezcla fotos y videos ordenados
por `created_at` descendente, con badge "Spot oficial" para videos cuya
`category` lo indique (convención de contenido, no requiere backend nuevo).
`created_at` ya existía y sirve de fecha real — **el único campo que sigue
faltando en backend es `location`** (caserío) en `campaign_photos` /
`campaign_videos`; documentado como TODO, degrada ocultando la ubicación
sin romper nada.

## 3. `Districts.tsx` → "Lugares Visitados" ✅ (full-stack)

Se extendió la tabla `districts` (ya era la fuente real del listado que
consume la home) en vez de crear una tabla nueva:

- **Migración nueva:** `2026_07_09_210000_add_visited_place_fields_to_districts_table.php`
  agrega `visited_at`, `event_type`, `highlight_text`,
  `highlight_photo_url` — todos nullable, no rompe el uso actual de
  `districts` para enrutamiento de keywords del chat.
- **`District.php`:** fillable/casts extendidos + `visitedPublic()`
  (solo activos con `visited_at` no nulo, orden descendente).
- **`DistrictController.php`:** validación admin extendida con los 4 campos
  nuevos (opcionales) en `store`/`update`.
- **`CandidateProfileController::show`:** el endpoint público `/api/candidate`
  ahora también devuelve `visited_places` — campo nuevo, no reemplaza
  `districts` (que Hero/OpinionSection siguen usando como lista simple de
  nombres para el buscador de zona).
- **Frontend:** `api.ts` (`VisitedPlace`, `CandidatePublicData.visited_places`,
  `DistrictItem` extendido), `CandidateContext.tsx` expone `visitedPlaces`,
  y `Districts.tsx` se reescribió: grid de lugares con capa de campaña
  (obligatoria) + capa de turismo (opcional, con degradado sin hueco vacío
  si falta), detalle en `Modal` genérico de la Fase 1 al hacer clic. Si el
  tenant todavía no tiene ningún lugar con `visited_at`, cae al
  comportamiento anterior (lista simple de distritos) — nunca una sección
  vacía.

**Pendiente manual:** correr `php artisan migrate` (no hay conexión a la
base de datos MySQL desde este entorno sandbox) y cargar contenido real
(fecha + reseña + foto) por caserío desde `/admin/districts` — el form de
ese panel no tiene todavía los 4 inputs nuevos, quedó fuera de esta sesión
por tiempo; se puede cargar directo por API/tinker mientras tanto.

## 4. Bloque de doble vía + "Lo que más preguntan los caseríos" ✅

- **`DosVias.tsx`** (nuevo): dos tarjetas bajo `StatsBar` — "Pregúntale a
  {candidato}" (→ `/chat`) y "Dile qué necesita tu caserío" (→
  `#opiniones`). No duplica `AssistantPreview` ni `OpinionSection`, solo
  agrega un punto de entrada más arriba en la página. Se muestra solo si
  ambos flags (`show_assistant`, `show_opinion`) están activos.
- **`ConcernsWidget.tsx`** (nuevo): descubrimiento clave — el backend **ya
  tenía todo lo necesario**, cero trabajo nuevo de backend:
  - `GET /api/analytics/summary` ya es público (throttled 20/min) y ya
    devuelve `top_topics` agregados por categoría.
  - `ChatMessage.topic` ya se clasifica automáticamente en el pipeline del
    chat existente.
  - `GET /api/candidate` ya expone `topics` (`label`/`emoji`/`color`) para
    traducir el slug a texto legible.
  - El widget solo muestra conteos agregados (nunca la pregunta textual de
    nadie, decisión ya tomada) y se oculta si hay menos de 5 conversaciones
    registradas — nunca conteos en cero o inventados.

## 5. Navbar — hallazgo de alcance, no se forzó

El diseño de nav de 7 pestañas de los mockups asumía una sola página con
anclas. La realidad del repo es distinta: `Navbar.tsx` enlaza a **páginas
dedicadas reales** (`/propuestas`, `/galeria`, `/videos`, `/distritos`,
`/en-vivo`, `/chat`), no a anclas de una sola página. Fusionar
"Galería"+"Videos" en el nav superior implicaría fusionar o redirigir esas
páginas reales — fuera de alcance de esta sesión. Se aplicó el único
cambio seguro y de alto valor: el label "Caseríos" → **"Lugares
Visitados"**, mismo href.

---

## Verificación

- `npx tsc --noEmit` → **sin errores**, corrido después de cada archivo y
  al final sobre todo el proyecto.
- `npm run build` → **no se pudo completar** en este entorno: el sandbox
  de esta sesión limita cada comando a 45s y el build de Next.js de este
  proyecto tarda más que eso (se confirmó que arranca sin errores de
  compilación tempranos, pero no llegó a terminar). Recomendado correrlo
  localmente o en CI antes de mergear — no hay señal de que vaya a fallar,
  pero no está verificado end-to-end.
- Nota técnica de la sesión: el mount del sandbox mostró contenido
  desactualizado/truncado para varios archivos editados (`DynamicHome.tsx`,
  `CandidateContext.tsx`, `api.ts`, `Navbar.tsx`) después de editarlos —
  se detectó comparando contra `git show HEAD:<archivo>` y se corrigió
  reescribiendo esos archivos directamente. El contenido final en disco es
  correcto (confirmado con `tsc` limpio); vale la pena que quien continúe
  este trabajo revise con `git diff` antes de asumir que un archivo quedó
  como se esperaba.

## Archivos tocados/nuevos (esta ampliación)

| Archivo | Tipo |
|---|---|
| `database/migrations/2026_07_09_210000_add_visited_place_fields_to_districts_table.php` | nuevo |
| `app/Models/District.php` | modificado |
| `app/Http/Controllers/DistrictController.php` | modificado |
| `app/Http/Controllers/CandidateProfileController.php` | modificado |
| `resources/js/src/lib/api.ts` | modificado |
| `resources/js/src/context/CandidateContext.tsx` | modificado |
| `resources/js/src/components/landing/DosVias.tsx` | nuevo |
| `resources/js/src/components/landing/ConcernsWidget.tsx` | nuevo |
| `resources/js/src/components/landing/MediaSection.tsx` | modificado |
| `resources/js/src/components/landing/Districts.tsx` | modificado |
| `resources/js/src/components/landing/DynamicHome.tsx` | modificado |
| `resources/js/src/components/ui/Navbar.tsx` | modificado |

## TODOs de backend consolidados (todas las fases hasta ahora)

1. `campaign_photos`/`campaign_videos`: falta campo `location` (caserío).
2. `districts`: migración escrita, **falta correr** `php artisan migrate`
   en un entorno con acceso real a la base de datos.
3. `/admin/districts`: el form del panel no tiene inputs para
   `visited_at`/`event_type`/`highlight_text`/`highlight_photo_url`
   todavía — el backend ya los acepta, falta la UI.
4. Contenido: video del Hero, fecha/reseña/foto por caserío en Lugares
   Visitados, fotos reales de campaña (heredado del reporte anterior).

**No se tocó nada de `en-vivo/[key]/page.tsx` ni Fase 3/4. Espero tu
revisión antes de continuar — en particular confirmar con `npm run build`
local, que no pude completar en este sandbox.**
