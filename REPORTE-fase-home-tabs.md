# REPORTE — Fase 7: Home a navegación por pestañas + lenguaje editorial completo

Rama: **`feature/home-tabs-editorial`** (nueva, desde `main` actualizado
`187976c`) — commit `56d9e29` (código) + este reporte, **pusheada a origin,
SIN merge a `main`**, como exige el Paso 7 del plan. `main` y producción
quedan intactos hasta tu revisión.

Fecha: 2026-07-10. Verificación: `tsc` limpio, `npm run build` OK, y
deep-links probados funcionalmente (detalle abajo).

---

## Qué se creó — `HomeTabs.tsx`

`components/landing/HomeTabs.tsx` (nuevo): la barra de 7 pestañas en el
orden validado — **Propuestas · Eventos y Cronómetro · En Vivo · Galería ·
Lugares Visitados · Equipo · Base del Conocimiento** — donde cada pestaña
renderiza el componente existente (`Proposals`, `EventsSection`,
`MediaSection`, `Districts`, `TeamSection`, `DocumentsSection`) sin
reescribirlo: solo pasaron de "siempre visibles" a "visibles si la pestaña
activa coincide".

- **Deep-link real, no estado React efímero:** la pestaña activa vive en la
  URL (`?seccion=propuestas|eventos|en-vivo|galeria|lugares|equipo|documentos`),
  leída con `useSearchParams` (envuelto en `Suspense`, requisito de Next 15)
  y escrita con `router.replace` sin recarga, **preservando el `?tenant=`
  existente**. Cualquier link puede abrir una pestaña desde cero:
  `/?tenant=rigo&seccion=documentos`.
- Con `?seccion=` en la carga inicial, las pestañas se llevan a la vista
  (el deep-link no te deja mirando el Hero); en la carga normal sin param
  no se salta nada.
- **Flags por tenant respetados:** cada pestaña se oculta si su flag
  `show_*` está apagado ("En Vivo" no tiene flag, igual que el banner);
  param inválido o pestaña oculta → cae a la primera visible.
- **Panel "En Vivo":** no duplica `LivePlayer`. Fetch propio de
  `/livestreams` (con `tenantHeaders()`): si hay transmisión activa,
  tarjeta expandida roja hacia `/en-vivo/{key}`; si no, estado vacío
  honesto ("No hay transmisión en este momento") con link a `/en-vivo`.
- Mobile-first: barra sticky con `overflow-x-auto` y pestañas
  `whitespace-nowrap shrink-0` — scrollea horizontal en 360px sin
  desbordar el body.

## Qué se eliminó de `DynamicHome.tsx` y por qué

- **`AssistantPreview` ("Servicios al ciudadano") ya no se renderiza** (el
  archivo se conserva). Quedó redundante: chat y "dile qué necesita" los
  cubre `DosVias` arriba de todo; "Portal de Transparencia" y "Documentos
  públicos" los cubre la pestaña "Base del Conocimiento"; "Reclamos y
  sugerencias" lo cubre "Lugares Visitados". Hay un comentario de 5 líneas
  en `DynamicHome.tsx` explicándolo para que nadie lo reactive por
  accidente. Sus hrefs internos se actualizaron igualmente a
  `?seccion=documentos` por higiene.
- **`OpinionSection` como sección** — ver siguiente bloque.
- El orden siempre-visible quedó exactamente como dicta el Paso 3:
  `LiveStreamBanner → Navbar → Hero → Countdown → StatsBar → DosVias
  (con ConcernsWidget) → BioSection → [pestañas] → Connection → Footer →
  ChatFAB`.

## `OpinionSection` → `OpinionModal`

El archivo `OpinionSection.tsx` ahora exporta **`OpinionModal`**: el mismo
formulario (nombre/caserío/tema/mensaje, con sus `htmlFor`/`id` de
accesibilidad) y la misma lógica de canal honesto
(`channelAvailable`/WhatsApp, sin simular éxito) — solo cambió el
contenedor: de `<section id="opiniones">` al **`Modal` genérico de la
Fase 1**, del que hereda focus-trap, retorno de foco, cierre con Escape y
scroll-lock sin trabajo extra. Lo abre el botón **"Dile qué necesita tu
caserío"** de `DosVias.tsx` (que pasó de `TenantLink` a `/#opiniones` a un
`<button>` con los mismos estilos). La columna izquierda de marketing de la
sección vieja se condensó en el header del modal (título + subtítulo) — un
modal enfocado no necesita las "promesas" decorativas.

## Tipografía y paleta (Paso 1)

- **Fraunces** cargada vía `next/font/google` como `--font-display`
  (pesos 600/700/900), aplicada **solo a los titulares** (`h1`/`h2` de la
  landing, con una regla scoped `.landing-main h1, .landing-main h2` en
  `globals.css` — un solo lugar, cero ediciones por componente). El cuerpo
  de texto y los títulos menores (h3 de cards) siguen en Source Serif 4,
  como recomendaba el plan. `tailwind.config` `font-display` ahora apunta a
  Fraunces.
- **Tokens al mockup** (en `globals.css`, un solo lugar): `--page-bg` ahora
  parte de crema `#FAF6EF` (conservando el tinte de marca 3% por tenant),
  `--page-ink` pasó a negro cálido `#1b1a17` (era `#0f1a12` verdoso), y
  `--page-soft`/`--page-ink-soft` se armonizaron a la misma temperatura.
  Además, 5 grises verdosos hardcodeados que estaban ligados al ink viejo
  (`#a9bdb0` en StatsBar, `#cfe0d3`/`#86a08e` en Footer, `#6b7b6f` en
  Districts) se migraron a equivalentes cálidos — sin esto, la franja
  oscura y el footer habrían quedado con textos de otra paleta.
- Hero, StatsBar, DosVias, ConcernsWidget y los componentes del restilo de
  la Fase 6 **no se reconstruyeron**: consumen los tokens actualizados.

## Enlaces actualizados (Paso 4) — antes → después

| Dónde | Antes | Después |
|---|---|---|
| `Navbar.tsx` — "Portal de Transparencia" | `/#documentos` | `/?seccion=documentos` |
| `Footer.tsx` — "Documentos" | `/#documentos` | `/?seccion=documentos` |
| `Footer.tsx` — "Agenda" | `/#eventos` | `/?seccion=eventos` |
| `Footer.tsx` — "Servicios" | `/#servicios` | **eliminado** (la sección AssistantPreview se retiró) |
| `Footer.tsx` — "Tu voz" | `/#opiniones` | **eliminado** — la opinión es un modal, no una URL enlazable; el canal equivalente (`/chat`) ya está como "Chatbot IA" y duplicarlo habría repetido href/key. Se agregó "Lugares Visitados" → `/?seccion=lugares` en su lugar |
| `Hero.tsx` — `handleMyZone` (GPS) | scroll a `#caserios` / `/distritos` | `goTenant("/?seccion=lugares")` |
| `AssistantPreview.tsx` (sin montar) | `#documentos` ×2 | `/?seccion=documentos` |
| `admin/hero-settings/page.tsx` | `/#eventos` (default + placeholder de btn3) | `/?seccion=eventos` |

- `Hero` `btn2_url` default `#bio` **no se tocó**: `BioSection` sigue
  siempre visible arriba de las pestañas, el ancla funciona.
- `TenantLink`/`withTenant` manejan el query param sin cambios (agregan
  `&tenant=` cuando la URL ya tiene `?`), verificado en la implementación.

**Hallazgo del grep fuera de la lista del plan:** los dos `/#eventos` de
`admin/hero-settings/page.tsx` (default de `btn3_url` y su placeholder) —
contenido que un tenant podía guardar y romper bajo pestañas. Corregidos.
El grep final da **cero** anclas restantes a secciones ocultas.

## Verificación (Paso 6)

- `npx tsc --noEmit`: **limpio** (tras cada archivo y al final).
- `npm run build`: **exitoso**, todas las rutas compilan (Suspense de
  `useSearchParams` sin warnings de build).
- **Deep-links probados funcionalmente** contra el server local con datos
  reales del tenant `rigo` (curl del HTML renderizado por el servidor):
  - `/?tenant=rigo` → pestaña Propuestas por defecto ✅
  - `?seccion=documentos` → barra con "Base del Conocimiento" ✅
  - `?seccion=equipo` → renderiza TeamSection ✅
  - `?seccion=eventos` → renderiza el cronómetro ✅
  - `?seccion=en-vivo` → panel En Vivo (estado vacío, no hay stream) ✅
  - Con `?seccion=equipo`, el panel de Propuestas **no** está en el HTML ✅
  (Nota: el server que atendió fue el dev server que ya corría en el
  puerto 3000 — compila el working tree actual, así que la verificación es
  del código de esta rama.)
- Modal de opinión: hereda focus-trap/Escape/scroll-lock del `Modal`
  genérico ya verificado en la fase de QA — sin trabajo extra, como
  anticipaba el plan. **Pendiente manual:** click real de apertura/cierre
  en navegador y pasada visual en 360px (sin navegador en este entorno).

## Confirmación de rama

**NO se mergeó a `main`.** El trabajo está en `feature/home-tabs-editorial`,
pusheada a origin, esperando tu revisión. Producción sigue sirviendo la
home de scroll continuo de las fases anteriores.
