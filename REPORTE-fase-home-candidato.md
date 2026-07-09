# REPORTE — Fase "Home candidato" (frontend-plan-03)

Rama: `feature/candidate-home-redesign` — commit local `a7770aa`, **sin push
ni merge a main**. 13 archivos: 12 modificados + 1 eliminado
(`ListaUnoBanner.tsx`), 155 inserciones / 166 borrados (la fase achica la home,
no la infla).

Fecha: 2026-07-09. Working tree limpio antes de empezar (Paso 0: solo los 3
`.md` untracked ajenos a la fase, no se tocaron).

---

## Punch list, ítem por ítem

### 1. `AssistantPreview.tsx` — dos 404 reales ✅ corregido en código

Las tarjetas "Portal de Transparencia" y "Documentos públicos" enlazaban a
`/transparencia` y `/documentos` — verificado contra `app/`: ninguna de las dos
rutas existe (las páginas reales son bienvenida, distritos, galería, videos,
en-vivo, propuestas, registro, chat, encuestar). Ambas apuntan ahora al ancla
`#documentos` (la sección de `DocumentsSection`, que ya recibe datos reales
desde la Fase PREP). De paso: la `key` del `map` era `s.href` y habría
duplicado keys de React con dos tarjetas al mismo ancla — cambiada a `s.to`.

**Hallazgos extra de la misma clase (corregidos también):**
- `Navbar.tsx`: el botón "Portal de Transparencia" del top bar apuntaba a
  `/transparencia` → ahora `/#documentos` (forma `/#id` porque el Navbar
  renderiza en todas las páginas, no solo la home).
- `Footer.tsx`: `/documentos` → `/#documentos`, `/#agenda` → `/#eventos` y
  `/#opinion` → `/#opiniones` — verifiqué los `id` reales de todas las
  secciones (`bio`, `propuestas`, `multimedia`, `servicios`, `eventos`,
  `caserios`, `documentos`, `equipo`, `opiniones`) y esos tres no existían.
- `Hero.tsx`: el default de `btn2_url` era `#sobre`, ancla que no existe en
  ninguna sección → `#bio` (el id real de `BioSection`). Solo era el default
  del frontend; ni el backend ni el seeder traen `#sobre`.

*Salvedad honesta:* si el tenant apaga `show_documents` o no tiene documentos
activos, `DocumentsSection` devuelve `null` y el ancla no scrollea (no navega a
ningún lado). Es benigno comparado con el 404, pero existe.

### 2. `DocumentsSection.tsx` — datos reales + Modal genérico ✅

- **Datos reales:** verificado en la fase anterior con curl en vivo contra el
  tenant `rigo` — `GET /api/knowledge` devuelve el shape exacto que el
  componente usa (`id`, `title`, `description`, `topic`, `file_url`,
  `file_size`, `is_active`), sin cambios de código necesarios en el fetch.
- **Tipo ajustado al shape real (no al revés):** `KnowledgeDocument` en
  `lib/api.ts` ahora declara `original_name`, `content` y `candidate_id` como
  opcionales, con comentario de que solo llegan en el endpoint admin. El
  admin (`/admin/knowledge`) sigue recibiéndolos y compila sin cambios.
- **Modal:** el `PdfModal` bespoke (55 líneas de backdrop/panel/ESC propios)
  ahora consume el `Modal` genérico de `components/ui/` — hereda focus-trap,
  retorno de foco y scroll-lock que su versión propia no tenía. El
  `AnimatePresence` se movió al render condicional del padre (donde
  corresponde para que la animación de salida funcione).

### 3. `ListaUnoBanner.tsx` — eliminado ✅ (decisión: eliminar, no transformar)

Comparé campo por campo contra `Navbar.tsx`: el banner mostraba logo, partido,
N° de lista, nombre, cargo y CTA "Hablar con X". El Navbar ya muestra **todo
eso**: partido y lista en el top bar y en el drawer móvil, nombre y cargo en el
bloque del logo, y el CTA de chat en desktop, en el drawer y además existe el
`ChatFAB` flotante. No quedaba ningún dato con valor añadido que justificara
transformarlo, así que se eliminó el componente y su render en
`DynamicHome.tsx` (~60px de scroll móvil recuperados justo bajo el hero).

### 4. Grids fijos ✅ corregido en código

- **`TeamSection.tsx`:** `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` →
  `flex flex-wrap justify-center` con tarjetas de ancho fijo
  (`w-[calc(50%-0.625rem)] sm:w-48 lg:w-52`). Con 1 integrante (caso real de
  `rigo`) la tarjeta queda centrada; con 2-3 también; con muchos, filas
  centradas que envuelven. Aproveché el archivo abierto para migrar la foto
  del integrante de `<img>` a `next/image` (`fill` + `sizes`), como pedía la
  regla de la fase.
- **`Connection.tsx`:** el grid `sm:grid-cols-2 max-w-2xl` ahora es
  condicional: con una sola red social renderiza una columna `max-w-md`
  centrada; con 2+ mantiene el grid de 2. (Elegí el condicional y no el
  `auto-fill` de Districts porque aquí son máximo 4 tarjetas anchas, no un
  grid denso de chips.)

### 5. `StatsBar.tsx` — datos honestos y configurables ✅

- **Eliminados los dos números inventados:** el fallback `13` de caseríos y el
  `+40` de propuestas. Ahora esas dos stats solo se muestran si hay datos
  reales del tenant (`districts.length > 0`, `proposalsCount > 0`); si no,
  se ocultan — un número falso de confianza es peor que no mostrar la cifra.
- **Etiquetas movidas a `home-settings`** (mismo patrón que los flags
  `show_*` y que `events_title`): keys `stats_districts_label`,
  `stats_plan_label`, `stats_proposals_label`, `stats_ai_label`, editables en
  `/admin/home-settings` en una tarjeta nueva "Barra de estadísticas". El
  backend (`SettingController`) ya acepta keys arbitrarias — verificado, cero
  cambios de backend.
- **Layout adaptativo:** en `md+` las celdas pasan de `grid-cols-4` fijo a
  `flex` con `flex-1`, así 2, 3 o 4 stats visibles siempre reparten el ancho.
- `DynamicHome` ahora pasa `settings` a `StatsBar`.

### 6. `OpinionSection.tsx` — fin del éxito simulado ✅

- Sin `whatsapp_number` configurado, **ya no se simula el envío**: el submit
  queda deshabilitado (`channelAvailable`) y en lugar del texto engañoso "Tu
  mensaje será revisado por el equipo" aparece un aviso ámbar honesto: "Este
  canal aún no está disponible. Mientras tanto puedes escribirle al asistente
  de {candidato}" con link real a `/chat` (que sí persiste conversaciones).
- `handleSubmit` tiene guard explícito: sin canal, no hay estado `sent`.
- **Flag `show_opinion` agregado** (la sección no se podía apagar por tenant):
  `DynamicHome` la renderiza bajo el flag con default "1", y el toggle está en
  `/admin/home-settings` junto a los demás `show_*`.

### 7. Branding "Habla con Perú Primero" — es CONTENIDO, no código ⚠️ TODO

Rastreé el string: el saludo se arma en `layout.tsx` / `DynamicTitle.tsx` /
`ShareFab.tsx` como `Habla con ${shortName}` donde `shortName` es la primera
palabra de `profile.name`. El código es correcto. El problema está en la BD del
tenant `rigo`: el curl en vivo de la fase anterior muestra
`"name": "peruprimero"` y `"party": "Por definir"` — es decir, **el nombre del
partido está cargado en el campo del nombre del candidato**, y el partido real
no está cargado. No hay string armado con el partido en ningún componente.

**TODO contenido (no bloqueante, se corrige desde el panel sin tocar código):**
en `/admin/candidate-profile`, campo **Nombre** → nombre real del candidato
(ej. "Rigoberto …"), campo **Partido** → "Perú Primero". Con eso el título de
la pestaña, el share y todos los saludos quedan bien automáticamente.

**Hallazgo relacionado corregido en código:** `Navbar.tsx` tenía "Perú
Primero" **hardcodeado** como fallback en 3 lugares (top bar, bloque del logo,
drawer móvil) — violación directa de la invariante "cero identidad de
candidato en código". Reemplazados por el fallback genérico "Campaña
Electoral" (el mismo que ya usa el Footer).

### 8. Slogan hero vs. footer — dos campos editables distintos, no es bug ✓ sin cambios

Confirmadas las fuentes: el titular del Hero sale de `hero_settings.title`
(editable en `/admin/hero-settings`, con fallback a `profile.tagline`); la cita
del Footer sale **siempre** de `profile.tagline` (editable en
`/admin/candidate-profile`). Son dos campos de contenido independientes por
diseño — titular de campaña vs. cita personal — y ambos se editan desde el
panel. Según el criterio del plan ("si el footer tiene su propio campo de cita
editable independiente del hero, es una decisión de contenido válida"), no hay
bug que arreglar. Si se quiere que digan lo mismo, es una edición de contenido:
igualar `tagline` y el título del hero desde el admin.

### 9. Galería sin fotos reales — CONTENIDO ⚠️ TODO, no bloqueante

`MediaSection.tsx` muestra lo que haya en la galería del tenant; hoy `rigo`
solo tiene fotos categoría "perfil". No hay nada que corregir en código: el
componente ya filtra y renderiza lo que el admin suba. **TODO contenido:**
subir fotos de eventos/caseríos vía `/admin/gallery` con categorías reales. No
toqué `MediaSection.tsx` por ningún otro ítem, así que su migración a
`next/image` queda para cuando se edite por una razón real (regla de la fase:
solo si ya estás en el archivo).

### 10. Avatar/logo del Navbar ✅ código + ⚠️ TODO contenido

El `object-fit: cover` ya estaba correcto — el recorte no era el problema.
Mejora aplicada: los dos `<img>` del Navbar (header y drawer) migrados a
`next/image` con `fill` y `sizes` exactos (44px/36px), que sirve la imagen
redimensionada al tamaño y DPR correctos en vez del original escalado por el
navegador. Si tras esto sigue viéndose pixelado, la causa es la resolución del
archivo de origen: **TODO contenido** — resubir el logo en al menos ~256×256
desde `/admin/candidate-profile`.

---

## Reglas de la fase — cumplimiento

- **Primitivos de la Fase 1:** el único modal tocado (`PdfModal`) consume el
  `Modal` genérico; no se inventaron colores ni espaciados nuevos (todo usa
  los tokens `--page-*`/`brand-*` existentes).
- **Cero identidad hardcodeada:** se eliminaron los 3 "Perú Primero" del
  Navbar; ningún componente tocado introduce datos de candidato.
- **`X-Tenant` intacto:** ningún fetch se modificó; los cambios de enlaces
  usan `TenantLink`, que inyecta `?tenant=` y preserva anclas
  (`withTenant("/#documentos")` → `/?tenant=rigo#documentos`, verificado en la
  implementación de `withTenant`). Nota: el `fetch` de livestreams del Navbar
  ya venía **sin** `X-Tenant` — es el mismo bug que el plan asigna
  explícitamente a la fase de en-vivo (`LiveStreamBanner`), así que no lo
  toqué aquí.
- **`next/image`:** migrado en `TeamSection` (tocado por ítem 4) y `Navbar`
  (tocado por ítems 1/7/10). `BioSection`, `MediaSection` y el modal de
  `Proposals` no se tocaron por ningún ítem, así que sus `<img>` quedan para
  la fase que los edite. `next.config.js` ya tiene los `remotePatterns` de los
  backends de tenant — verificado antes de migrar.
- **`tsc` después de cada archivo:** corrido tras cada ítem (5 corridas
  intermedias), siempre limpio antes de seguir.

## Verificación final

- `npx tsc --noEmit` → **sin errores**.
- `npm run build` (Next.js, producción) → **exitoso**, todas las rutas
  compilan; bundle compartido sin cambios (101 kB).
- Grep final: cero referencias restantes a `ListaUnoBanner`, `/transparencia`
  o `"/documentos"` como ruta.
- Comparación visual contra `politic-os-beta.vercel.app/?tenant=rigo`: no
  ejecutada desde esta sesión (sin navegador); los ítems estructurales (3, 4,
  5, 6) son verificables en el build local con `npm run dev` — recomendado
  como parte de tu revisión.

## Archivos tocados (13)

| Archivo | Ítems |
|---|---|
| `components/landing/AssistantPreview.tsx` | 1 |
| `components/landing/DocumentsSection.tsx` | 2 |
| `lib/api.ts` | 2 (tipo `KnowledgeDocument`) |
| `components/landing/ListaUnoBanner.tsx` | 3 — **eliminado** |
| `components/landing/DynamicHome.tsx` | 3, 5, 6 |
| `components/landing/TeamSection.tsx` | 4 (+ next/image) |
| `components/landing/Connection.tsx` | 4 |
| `components/landing/StatsBar.tsx` | 5 |
| `app/admin/home-settings/page.tsx` | 5, 6 (labels + flag) |
| `components/landing/OpinionSection.tsx` | 6 |
| `components/landing/Hero.tsx` | 1 (ancla `#bio`) |
| `components/ui/Footer.tsx` | 1 (anclas) |
| `components/ui/Navbar.tsx` | 1, 7, 10 (+ next/image) |

## Nada resultó más complejo de lo esperado, con dos matices

1. El ítem 7 no era ni config del hero ni string armado en código: es un dato
   mal cargado en `candidate_profiles.name` del tenant. El fix es 100% de
   panel, cero código (detalle arriba).
2. El ítem 1 resultó más extendido de lo que decía el plan: los mismos links
   muertos existían también en `Navbar` y `Footer` (más dos anclas con id
   equivocado y un default `#sobre` inexistente en Hero). Se corrigieron todos
   en esta fase por ser la misma clase de bug.

**No he tocado `en-vivo/[key]/page.tsx` ni ninguna otra fase. Espero tu
revisión antes de continuar.**
