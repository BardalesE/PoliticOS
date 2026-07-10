# REPORTE — Fase 4 del plan (frontend-plan-05): Responsive, performance y checklist de lanzamiento

Rama: `feature/candidate-home-redesign` — commit local `dd218fa` (código) +
este reporte, **sin push ni merge a main**. Es la última fase del plan
maestro: con esto, las 8 fases (urgentes + 0-4 + restilo) están completas
en la rama, esperando tu revisión y el merge a `main`.

Fecha: 2026-07-10.

---

## Checklist de lanzamiento — estado real, ítem por ítem

| # | Ítem | Estado |
|---|------|--------|
| 1 | `npx tsc --noEmit` sin errores | ✅ **Corrido** — limpio (tras cada archivo y al final) |
| 2 | `npm run build` exitoso | ✅ **Corrido** — todas las rutas compilan, bundle compartido 101 kB |
| 3 | Home con datos reales del backend | ✅ **Corrido** — smoke test de los 10 endpoints públicos contra `rigo` con `X-Tenant`: todos HTTP 200. Con datos reales: `candidate` (incl. `visited_places`), `knowledge` (1 doc), `gallery`, `campaign-videos`, `hero-settings`. Vacíos (contenido del tenant, no errores — la home tiene fallbacks): `proposals`, `events`, `team-members`, `home-settings`, `livestreams` |
| 4 | En-vivo sigue funcionando | ✅ La fase anterior no tocó la lógica MSE/polling/grabación (solo headers y colores); `tsc`+`build` verdes. ⚠️ Prueba funcional de una transmisión real: pendiente manual (requiere emitir desde el admin) |
| 5 | X-Tenant en todos los fetches públicos | ✅ **Verificado por grep** — cero fetch públicos sin header; los únicos sin él son 3 del panel admin (fuera de alcance; `BroadcastStudio.tsx:67` documentado como TODO) |
| 6 | Sin overflow horizontal en 360px | ✅ **Análisis de código**: sin anchos fijos >300px en la landing; countdown con `tabular-nums` y truncado móvil; grids fluidos (`auto-fill`/flex-wrap); el visor en-vivo colapsa a 1 columna. ⚠️ Confirmación visual en dispositivo real: pendiente manual (sin navegador en este entorno) |
| 7 | Sin librerías de admin en el bundle público | ✅ **Verificado por grep** — `recharts` solo aparece en `components/admin/charts/*` y `app/admin/intelligence`; ninguna página pública ni componente compartido lo importa |
| 8 | Cronómetro correcto en el deploy real | ⚠️ **Parcial** — el fix está en `main` (que es lo que sirve Vercel) desde la fase urgente, y el código de la rama lo preserva y lo endurece (`EventsSection` con `sameCalendarDay`, `Countdown` que no renderiza sin fecha vigente). Lighthouse cargó la página del deploy sin errores. La confirmación visual del conteo exacto en el deploy: pendiente manual (1 min de revisión en el navegador) |
| 9 | Punch list de la Fase 2 resuelta/documentada | ✅ Los 10+1 ítems: resueltos en código (1-6, 10, 11) o documentados como contenido (7: `name`="peruprimero" en la BD de rigo; 8: no era bug; 9: subir fotos reales) — detalle en `REPORTE-fase-home-candidato.md` |
| 10 | Fuga `/candidate` y endpoint `/knowledge` verificados | ✅ **Re-verificado hoy en vivo**: fuga cerrada (0/8 campos sensibles en la respuesta real) y `/api/knowledge` respondiendo con datos reales filtrados sin `content` |
| 11 | TODOs de backend consolidados | ✅ Bloque único abajo |

## Lighthouse contra el deploy real (Paso 2.4) — corrido, con contexto importante

`npx lighthouse https://politic-os-beta.vercel.app/?tenant=rigo` (headless,
condición real de red CDN Vercel + backend Render):

| Categoría | Score |
|---|---|
| Performance | **43** |
| Accesibilidad | **89** |
| Best Practices | **96** |
| SEO | **100** |

Métricas: FCP 1.4s · **LCP 5.3s** · **TBT 2,310ms** · CLS 0.

**Contexto crítico:** el deploy de Vercel sirve `main`, que **no incluye
nada de esta rama** (las 8 fases están sin mergear). Estos scores son la
línea base de lo que el votante ve HOY, no el estado del feature branch.
Los 3 fallos de accesibilidad que reporta el deploy ya están corregidos
en la rama:

1. **Contraste insuficiente** → corregido a nivel de token en esta fase
   (`ink-400` de `#A3A3A3` ≈2.5:1 a `#767676` = 4.54:1 AA — era el tono de
   texto secundario/meta de toda la home) + 2 textos informativos subidos
   de `ink-300` a `ink-400`.
2. **Selects sin label asociado** → corregido: los 4 campos del formulario
   de opinión ahora tienen `htmlFor`/`id`.
3. **Headings fuera de orden** → la home de la rama (post-rediseño) sigue
   h1 (Hero) → h2 (secciones) → h3 (cards); el fallo es del layout viejo
   de `main`. Re-verificar con Lighthouse después del merge.

El LCP de 5.3s y TBT de 2.3s del deploy deberían mejorar con la rama
(hero editorial sin orbes animados, `next/image` en todas las imágenes de
contenido, ListaUnoBanner eliminado) — **recomendación: correr Lighthouse
de nuevo tras el merge como parte de tu verificación**, y si el LCP sigue
alto, el siguiente sospechoso es el video de fondo del hero y la latencia
del primer fetch a Render (cold start del plan free, si aplica).

## Paso 1 — Responsive

Sin navegador en este entorno, la pasada fue de análisis de código +
fixes: no quedan anchos fijos con riesgo de overflow en la landing (los
dos únicos `max-w-[Npx]` son de truncado, correcto); los grids son
fluidos; el countdown no rompe layout al cambiar de dígitos
(`tabular-nums`, verificado en el código); los modales usan el `Modal`
genérico con `max-height` en `vh` y scroll interno (usable con teclado
móvil abierto). **Pendiente manual (10 min):** pasada visual en
360/390/768/1024/1440 con el inspector — especialmente el CTA del Hero
visible sin scroll en 360px, que depende del contenido real
(título/subtítulo largos del tenant).

## Paso 2 — Performance (además de Lighthouse)

- **`next/image` completado** en las últimas imágenes de contenido que
  faltaban: feed de `MediaSection`, imagen del modal de `Proposals`, logo
  del `Footer`, y las fotos de Lugares Visitados en `Districts` — estas
  últimas iban como `background-image` CSS (sin optimización, sin lazy,
  sin `alt`); ahora son `Image fill` con `sizes` y `alt` descriptivo.
  Con esto, **cero `<img>` planos en la home y el visor en-vivo**
  (los que quedan: `/bienvenida`, `/galeria` y admin — otras pantallas).
- **Lazy real**: `next/image` sin `priority` es lazy por defecto; la única
  imagen `priority` es el fondo del Hero (correcto, es el LCP).
- **recharts**: solo admin, verificado.

## Paso 3 — Accesibilidad

- **Alts**: todas las imágenes de contenido tienen `alt` descriptivo
  (nombre del integrante, título de la foto/propuesta/lugar); los únicos
  `alt=""` son fondos decorativos del Hero (correcto).
- **Modal genérico** (focus-trap + retorno de foco + Escape + scroll-lock)
  confirmado en los 3 modales de la home: detalle de propuestas, visor de
  PDF de documentos, y detalle de Lugares Visitados. La "galería" de la
  home (`MediaSection`) no tiene modal (es un feed con marquee); el modal
  de `/galeria` es de `interactive-bento-gallery` (página aparte, no
  entraba en esta fase).
- **Contraste AA**: corregido a nivel de token (detalle arriba).
- **`aria-label`**: `ChatFAB` ya lo tenía (en sus dos modos) y `Countdown`
  también (`aria-label="Cuenta regresiva: {label}"`) — verificado, sin
  cambios necesarios.

## Limpieza de huérfanos (opcional del plan) — hecha

Verificado con grep quién importa cada uno antes de tocar nada:

- **Eliminados** (0 importadores): `FinalCTA.tsx`, `RojiblancoBanner.tsx`,
  `ShareFab.tsx`, y el duplicado `components/interactive-bento-gallery.tsx`
  (la copia de `components/ui/` es la que usa `/galeria` y se queda).
  −624 líneas de ruido.
- **NO eliminados** (la auditoría los daba por huérfanos pero SÍ se usan):
  `ui/hero-with-video.tsx` (importado por `/bienvenida` como `NavbarHero`)
  y `ui/interactive-bento-gallery.tsx` (usado por `/galeria`). `GlassCard`
  también se usa (`/videos`, `/propuestas`).

## TODOs de backend consolidados (todas las fases)

1. **`campaign_photos`/`campaign_videos`: campo `location`** (caserío) —
   la Galería unificada ya sabe mostrarlo y degrada ocultándolo.
2. **`CandidateProfile.bio_timeline`** (JSON `[{year,title,detail?}]`) —
   `BioSection` tiene la línea de tiempo lista con fallback vacío.
3. **`BroadcastStudio.tsx:67`** (admin): fetch de `/info` sin `X-Tenant` —
   mismo bug de la fase en-vivo, en pantalla admin (fuera de alcance del
   plan frontend público).
4. **Contenido, no backend** (se corrige desde el panel): `name`/`party`
   del tenant rigo (`"peruprimero"` en el campo del nombre), textos del
   hero, video del Hero, fotos reales de campaña con categorías, fecha/
   reseña/foto por caserío en `/admin/districts` (el form ya tiene los 4
   inputs), logo en ≥256px si persiste el pixelado del navbar.
5. **Validar `jne_entities_2026.json`** contra el padrón oficial
   JNE/Infogob antes de producción (deuda conocida de CLAUDE.md, no de
   este plan, pero va en la misma lista de pre-lanzamiento).

## Riesgos abiertos para el lanzamiento (no resueltos por este plan)

1. **La divergencia feature↔main es ya de ~14 commits sin mergear.** El
   deploy real sigue sirviendo el código viejo (con la fuga de
   `/candidate` incluida, que en `main` sigue abierta — es información de
   estrategia visible públicamente hoy). Cuanto antes se mergee tras tu
   revisión, antes se cierra eso en producción. El fix de seguridad
   (`249dcef`) es cherry-pickeable si quieres adelantarlo solo.
2. **Performance 43 en producción** — mejorable con el merge, pero si el
   backend de Render tiene cold starts, el primer fetch del votante
   seguirá lento independiente del frontend; medir tras el merge.
3. **Verificaciones que necesitan ojos/dispositivo** (no automatizables
   desde aquí): pasada visual responsive, conteo del cronómetro en el
   deploy, y una transmisión en vivo de prueba end-to-end.
4. **Contenido del tenant rigo incompleto** (propuestas, eventos, equipo
   vacíos) — la home degrada con fallbacks, pero el votante de octubre
   debería ver datos reales, no los 6 pilares de ejemplo.

**Fin del plan maestro: no queda ninguna fase pendiente. Todo está en
`feature/candidate-home-redesign`, local, esperando tu revisión y el
merge a `main` (que haces tú).**
