# REPORTE — Fase 6: Restilo editorial (quitar el look "SaaS con glow")

Rama: `feature/candidate-home-redesign` — 2 commits locales nuevos, **sin push
ni merge a main**:

| Commit | Contenido |
|---|---|
| `5c2e47e` | Checkpoint de la sesión Cowork del 9-jul (estaba sin commitear: Hero restilado, DosVias, ConcernsWidget, Lugares Visitados, MediaSection unificado, backend districts + reporte). Se commiteó como base separada para que el diff del restilo quede limpio. |
| `024038f` | El restilo editorial de esta fase + los 3 pendientes del Paso 7. |

Fecha: 2026-07-09. Paso 0 cumplido: leí ambos reportes, verifiqué `git status`
y `tsc` sobre el trabajo de Cowork antes de tocar nada; no se pisó ni revirtió
nada de esa sesión.

Patrón aplicado (extraído de `Hero.tsx`, la referencia viva): bordes finos
`1px var(--page-line)`, colores sólidos `rgb(var(--brand-primary-rgb))`,
badges de punto sólido + borde fino, `transition-colors duration-150`, hover
de borde + `translateY(-2px)` sin sombra difusa. Cero valores nuevos fuera de
los tokens de la Fase 1.

---

## Paso 1 — `Proposals.tsx` ✅ (cambio mínimo)

Ya era mayormente plano (bordes `--page-line`, pips sólidos, sin gradientes).
Lo único "glow" era el hover de las tarjetas-pilar: sombra difusa
`0 30px 60px -34px var(--page-shadow)` + `translateY(-6px)`. Ahora: borde con
tinte de marca (`color-mix 35%`) + `translateY(-2px)`, `transition-colors`,
sin sombra. El modal de detalle ya consumía el `Modal` genérico y su contenido
interno (badge de estado con pip sólido, link con subrayado sólido) ya seguía
el lenguaje plano — **no se tocó**.

## Paso 2 — `AssistantPreview.tsx` ✅

Hover de las 4 tarjetas de servicios simplificado igual que Proposals: fuera
la sombra de 50px, queda borde con tinte de marca + `translateY(-2px)`. Los
fondos de icono con `color-mix(... 10%, transparent)` se conservaron (el plan
los marca explícitamente como correctos).

## Paso 3 — `OpinionSection.tsx` ✅ (el que más tenía)

- Título "lo que piensas." — `WebkitBackgroundClip` con `--brand-grad` →
  color sólido `rgb(var(--brand-primary-rgb))`.
- Botón de submit — `var(--brand-grad)` + `0 6px 20px var(--brand-glow-30)` →
  fondo sólido plano, sin sombra, `transition-colors`.
- Card del formulario — `0 8px 40px var(--brand-glow-10)` → borde 1px
  `var(--page-line)`, sin sombra.
- Extras del mismo archivo con el mismo patrón: círculos de los checks de
  "promesas" y círculo del estado de éxito (ambos tenían `--brand-grad`, el
  segundo además glow) → sólidos; badge "Tu opinión importa" → estilo Hero
  (punto + borde fino).
- **La lógica de `channelAvailable`/estado honesto no se tocó** — solo estilo.

## Paso 4 — Auditoría de los componentes del 9-jul

| Componente | Resultado |
|---|---|
| `StatsBar.tsx` | Limpio — nada que cambiar. |
| `ConcernsWidget.tsx` | Limpio — nada que cambiar. |
| `Districts.tsx` | Limpio — el único `animate-pulse` es el skeleton de carga (funcional, se queda). |
| `DosVias.tsx` | Un escape: sombra difusa `--page-shadow` en el hover → eliminada, queda solo el cambio de borde. |
| `MediaSection.tsx` | Sin cambios. Sus 2 `backdrop-blur` son overlays **sobre fotos/video** (botón de play y badge "Spot oficial") — legibilidad sobre imagen, no decoración SaaS; la sombra de sus cards es negra neutra sobre fondo oscuro, no glow de marca. Decisión deliberada de conservarlos. |

## Paso 5 — Barrido general (`grep brand-glow|brand-grad|backdrop-blur|Sparkles|WebkitBackgroundClip`)

Instancias que se escaparon de la punch list, **todas corregidas** por ser
visibles en la home pública:

- **`EventsSection.tsx`** (el mayor hallazgo, 12+ instancias): dígitos del
  countdown con gradiente de 3 paradas + glow → sólido; header del card del
  countdown con `--brand-grad` → sólido; borde `brand-200` + glow del card →
  `--page-line` sin sombra; "¡Es hoy!" y el énfasis del título con gradiente
  de texto → sólidos; tiles de fecha (mini-cards y esquina de la imagen) y
  icono del empty-state con grad+glow → sólidos; badge "Agenda" con `Zap` →
  estilo Hero (punto + borde); 2 `animate-ping`/`animate-pulse` decorativos →
  puntos estáticos; `backdrop-blur` sobre fondos opacos → eliminados;
  placeholder degradado → plano. Import de `Zap` eliminado.
- **`DocumentsSection.tsx`**: icono del modal y de las cards con
  `--brand-grad`+glow → sólidos; hover de cards con glow → solo borde
  (clases `hover:border-brand-300` existentes); barra superior animada con
  gradiente → sólida; título con gradiente de texto → sólido; badge con
  `BookOpen` → estilo Hero. Import de `BookOpen` eliminado.
- **`Connection.tsx`**: título con gradiente de texto → sólido; badge →
  estilo Hero; tarjetas sociales sin glow de color (`0 8px 32px ${glow}`),
  sin orb decorativo `blur-xl`, sin `scale` al hover (queda `y: -2`), campo
  `glow` eliminado del data/tipo. **Se conservaron los gradientes de fondo de
  cada red** (azul Facebook, verde WhatsApp, degradado Instagram): son
  identidad de esas plataformas, no estética SaaS.
- **`Navbar.tsx`**: CTAs "Chatear"/"Conversar con X" sin glow y sin
  `animate-ping` (punto estático, como el status del Hero); sombra del header
  al scrollear de `--brand-glow-10` → neutra `rgba(0,0,0,0.06)`.
- **`BioSection.tsx`**: sombra difusa `--page-shadow` de la foto → solo borde
  fino; de paso la foto migró de `<img>` a `next/image` (regla pendiente de
  la fase anterior: se migra al tocar el archivo).

**Fuera de alcance (encontrado por el grep, intencionalmente sin tocar):**
- Panel admin (`ConfirmDialog`, `Modal`, `FilePreviewModal`,
  `UpgradePlanModal`): el plan lo excluye.
- `ui/Modal.tsx` (backdrop del modal genérico), `ConsentModal`, `LiveAlert`:
  `backdrop-blur` de backdrop de diálogo — funcional.
- `LiveStreamBanner`: `animate-ping` del indicador "EN VIVO" — semántica de
  transmisión en vivo, y además en-vivo es de otra fase.
- `interactive-bento-gallery` y `hero-with-video`: se usan en `/galeria` y
  `/bienvenida` (páginas dedicadas, no la home) — quedan para la fase que
  toque esas páginas.
- Falsa alarma verificada: el grep sugería rutas con backslash de nuevo en
  `api.ts` (regresión de la reescritura en el sandbox de Cowork) — leído el
  archivo directamente, las rutas están correctas con `/`; era un artefacto
  del render del grep.

## Paso 7 — Pendientes de backend ✅ los tres

1. **Migración corrida y verificada.** `php artisan migrate` en la BD default
   dijo "Nothing to migrate" (ya estaba al día), pero las BDs de los tenants
   NO lo estaban: corrí `migrate` dentro de `TenantContext::run` para cada
   tenant activo. Resultado real: `camilo` aplicó 5 migraciones pendientes y
   `rigo` aplicó 4 (ambos incluían la de districts, y de paso se pusieron al
   día migraciones de junio que tenían colgadas). Verificación por schema:
   **`rigo`: 4/4 columnas nuevas** (`visited_at`, `event_type`,
   `highlight_text`, `highlight_photo_url`) y **`camilo`: 4/4**.
2. **Form de `/admin/districts`.** Bloque nuevo "Visita de campaña
   (opcional)" con los 4 inputs sobre el `FormField` existente: fecha
   (`type="date"`), tipo de evento, reseña (`as="textarea"`) y URL de foto,
   con nota de que solo los distritos con fecha aparecen en "Lugares
   Visitados". `EMPTY`/`openEdit` actualizados; los strings vacíos se envían
   como `null` (la validación `nullable|date` del backend los acepta).
3. **`npm run build` completo: exitoso** — todas las rutas compilan, bundle
   compartido 101 kB. Esto cierra la verificación que el sandbox de Cowork no
   pudo terminar por su límite de 45s.

## Verificación final

- `npx tsc --noEmit`: **limpio** (corrido tras cada archivo tocado y al final).
- `npm run build`: **exitoso end-to-end**.
- `php artisan test`: **23 pasan** (70 aserciones) — el backend del checkpoint
  de Cowork no rompió nada.
- Grep final de patrones vetados en `components/landing/`: solo quedan los 2
  `backdrop-blur` funcionales de MediaSection (documentados arriba).

## Archivos tocados en esta fase (commit `024038f`)

`Proposals.tsx`, `AssistantPreview.tsx`, `OpinionSection.tsx`,
`EventsSection.tsx`, `DocumentsSection.tsx`, `Connection.tsx`, `DosVias.tsx`,
`BioSection.tsx`, `ui/Navbar.tsx`, `admin/districts/page.tsx` — 10 archivos,
135 inserciones / 131 borrados.

**No toqué `en-vivo/[key]/page.tsx`, `/galeria`, `/bienvenida` ni ninguna otra
fase. Espero tu revisión.**
