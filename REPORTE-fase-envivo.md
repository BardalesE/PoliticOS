# REPORTE — Fase 3 del plan (frontend-plan-04): En-vivo y componentes compartidos

Rama: `feature/candidate-home-redesign` — commit local `079c477` (código) +
este reporte, **sin push ni merge a main**. 9 archivos, 114 inserciones /
75 borrados. Working tree limpio antes de empezar (solo los 3 `.md`
untracked ajenos de siempre).

Fecha: 2026-07-09.

---

## 1. X-Tenant — los 4 puntos del plan, confirmados uno por uno ✅

| Punto del plan | Estado |
|---|---|
| `en-vivo/[key]/page.tsx` — `/livestreams/{key}/info` (era línea 110) | ✅ `{ headers: tenantHeaders() }` |
| `en-vivo/[key]/page.tsx` — `/comments` GET (era línea 126) | ✅ `{ headers: tenantHeaders() }` |
| `en-vivo/[key]/page.tsx` — `/comments` POST (era línea 158) | ✅ `{ "Content-Type": …, ...tenantHeaders() }` |
| `LiveStreamBanner.tsx` — `/livestreams` (era línea 22) | ✅ `{ headers: tenantHeaders() }` |

Para esto **exporté `tenantHeaders()` de `lib/api.ts`** (era una función
privada del módulo — el patrón existía pero no era importable). Es el
mecanismo único que pide el plan; no se inventó ninguno nuevo.

### La regresión era más amplia — misma clase de bug, corregida también

Leyendo los archivos completos (regla de la fase) apareció el mismo fetch
pelado en más puntos del frontend público que la auditoría no listó:

- **`LivePlayer.tsx`** (el reproductor en sí): `/info` (polling), el fetch
  de **chunks** del stream MSE, y el POST de `/ping` (conteo de
  espectadores) — los tres sin header. Además el `<video src>` de la
  **grabación** no puede llevar headers HTTP: ahí el tenant viaja como
  `?tenant=` en la URL, mecanismo que `ResolveTenant` ya acepta (query
  param, verificado en el middleware). Sin esto, en Vercel el reproductor
  entero — no solo la metadata — operaba contra el tenant por defecto.
- **`Navbar.tsx`**: el check de `/livestreams` que enciende el punto rojo
  de "En vivo" en el nav (ya lo había detectado en la fase de la home; el
  plan lo difería a esta fase).
- **`LiveAlert.tsx`**: `/livestreams`.
- **`en-vivo/page.tsx`** (la página índice, no solo `[key]`): `/candidate`
  y `/livestreams`.
- **`chat/page.tsx`**: `/chat/location` (el POST del GPS del votante). Los
  otros 3 fetch del chat (`/chat`, `/chat/stream`, `/citizen/register`) ya
  llevaban el header con el idiom propio del archivo — usé ese mismo idiom
  para consistencia interna.

**Barrido final:** `grep` de `` fetch(`${API|base}` `` en todo `src/` — los
únicos fetch sin `tenantHeaders()` que quedan son los del **panel admin**
(`BroadcastStudio.tsx`, `admin/ai-settings`, `admin/livestream`), que están
explícitamente fuera del alcance de este plan. Nota para el futuro:
`BroadcastStudio.tsx:67` (`/info` del estudio de transmisión admin) tiene
el mismo patrón — documentado aquí como TODO, no tocado.

## 2. Duplicación home ↔ en-vivo (Paso 1) — qué se movió y qué no

Comparé el visor contra la home componente por componente, según la lista
del plan:

- **Countdown, ChatFAB, mosaico multimedia, redes sociales, header/nav:**
  ninguno existe hoy en el visor, y ninguno aplica ahí — es una página de
  visualización enfocada (player + chat), no una landing. El plan dice "si
  no aplica ahí, no lo agregues por agregar", así que **no se agregó nada**.
- **Ya compartidos** (no había copia paralela): `TenantLink`
  (`components/ui/`) y `LivePlayer` (`components/live/`). No existe
  convención de carpeta `shared/` en el repo — lo compartido vive en
  `components/ui/` y `components/live/`, y respeté esa convención.
- **Duplicación real encontrada y extraída:** el pill **"EN VIVO"** estaba
  copiado casi idéntico 3 veces (top bar del visor, fila del broadcaster,
  overlay del player). Nuevo **`components/live/LiveBadge.tsx`** con
  variantes `solid` (pill rojo, sobre video/nav) y `soft` (fondo claro con
  borde, sobre superficies blancas); los 3 puntos ahora lo consumen.
  `LiveStreamBanner` no se migró: es una franja full-width con layout
  propio, no un pill.

## 3. Alineado visual (Paso 2) — sin tocar la lógica de streaming

**Lo que quedó intacto (explícito):** todo el pipeline de reproducción —
MSE (`MediaSource`/`SourceBuffer`), cola de chunks, polling de info y de
comentarios, ping de espectadores, `RecordingPlayer` con HEAD probe y
range requests, manejo de `viewer_token` y `viewer_name` en localStorage.
Los únicos cambios en esas funciones fueron los headers de los fetch.

**Lo alineado:**
- Fondo de página `bg-gray-50` → `var(--page-bg)` (el papel crema de la
  home); tarjetas con borde `1px var(--page-line)`; escala `gray-*` →
  `ink-*` en todos los textos; título de la transmisión en `font-serif`.
- **Acentos de interacción** (form "¿Cómo te llamas?", input de
  comentario, botón de enviar, focus rings, link "Volver", ring del
  avatar) migrados de `red-*` genérico → tokens `brand-*` — en un tenant
  con marca no-roja ahora siguen su color de campaña.
- **Decisión documentada:** los indicadores de "EN VIVO" (LiveBadge, la
  franja del banner, el spinner de conexión del player) **se quedan
  rojos a propósito** — el rojo de broadcast es una convención universal
  (semántica de estado, como el verde de WhatsApp), no branding; se marcó
  en el propio `LiveBadge.tsx` para que nadie lo "corrija" después.
- Foto del candidato en la fila del broadcaster: `<img>` → `next/image`
  (`fill`, `sizes="40px"`).
- Mobile: el layout ya era mobile-first (grid que colapsa a 1 columna bajo
  `lg`, player `aspect-video` fluido) — sin overflow horizontal a 360px;
  no hizo falta tocarlo.
- Los primitivos `Button`/`Card`/`Section` de la Fase 1 casi no aplican
  aquí (son primitivos de landing; el visor es una pantalla tipo app con
  layout propio) — se alineó vía tokens, que es lo que garantiza la
  coherencia visual, en vez de forzar un refactor estructural sin valor.

## 4. Verificación final (Paso 4)

- `npx tsc --noEmit` → **sin errores** (corrido tras cada archivo tocado).
- `npm run build` → **exitoso**, todas las rutas compilan, bundle
  compartido estable en 101 kB.

## Archivos tocados (9)

| Archivo | Cambio |
|---|---|
| `lib/api.ts` | `tenantHeaders()` exportado |
| `app/en-vivo/[key]/page.tsx` | 3 fetch con X-Tenant + tokens + LiveBadge + next/image |
| `app/en-vivo/page.tsx` | 2 fetch con X-Tenant |
| `components/live/LivePlayer.tsx` | 3 fetch con X-Tenant + `?tenant=` en grabación + LiveBadge |
| `components/live/LiveAlert.tsx` | 1 fetch con X-Tenant |
| `components/live/LiveBadge.tsx` | **nuevo** — pill EN VIVO compartido |
| `components/landing/LiveStreamBanner.tsx` | 1 fetch con X-Tenant |
| `components/ui/Navbar.tsx` | 1 fetch con X-Tenant |
| `app/chat/page.tsx` | `/chat/location` con X-Tenant |

**No toqué el panel admin ni arranqué la fase 05 (responsive/QA). Espero
tu revisión.**
