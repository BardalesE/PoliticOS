# Mobile-first del sitio público + medios en admin (archivo primero)

**Fecha:** 2026-08-05
**Estado:** Aprobado

## Contexto

El sitio público (lo que ve el votante) necesita mejor adaptación a celulares.
Además, el panel admin tiene una sección (Hero Settings) donde subir un enlace
pesa lo mismo que subir un archivo, cuando debería ser secundario. Este spec
cubre ambos frentes. **Fuera de alcance** (explícitamente pospuesto por el
usuario): el aviso de almacenamiento efímero en Render free tier — se deja
documentado en la conversación, no se implementa ahora.

## 1. Sitio público — mobile-first

### 1.1 Quitar el badge "Portal de Transparencia"

`resources/js/src/components/ui/Navbar.tsx` — se elimina la franja azul
superior completa (el `<div className="bg-brand-700">` con el link a
`/?seccion=documentos`), en desktop y mobile. El acceso a documentos se
mantiene vía Footer y la tarjeta de `AssistantPreview` (contenido real, no
banner persistente — no se tocan).

### 1.2 Unificar "Lugares Visitados" → "Mi Comunidad", un solo destino directo

Estado actual (tres nombres / dos destinos para lo mismo):

| Origen | Label actual | Destino actual |
|---|---|---|
| `Navbar.tsx` NAV_DEFS | "Lugares Visitados" | `/distritos` |
| `Footer.tsx` contentLinks | "Caseríos" | `/distritos` |
| `Footer.tsx` participaLinks | "Lugares Visitados" | `/?seccion=lugares` |
| `Hero.tsx` `handleMyZone` (GPS) | — | `/?seccion=lugares` |
| `HomeTabs.tsx` TABS | pestaña "lugares" | render `<Districts />` inline |

Cambios:
- `Navbar.tsx`: label → **"Mi Comunidad"**, destino `/distritos` (sin cambio de ruta).
- `Footer.tsx`: colapsar los dos links en **uno solo**, "Mi Comunidad" → `/distritos`
  (se quita la entrada duplicada de `participaLinks`).
- `Hero.tsx`: `handleMyZone` navega a `/distritos` en vez de `/?seccion=lugares`.
- `HomeTabs.tsx`: se quita la entrada `lugares` de `TABS` (el contenido de
  `Districts` ya vive en `/distritos`, no hace falta duplicarlo como pestaña).
- Cualquier otro `href="/?seccion=lugares"` remanente (grep antes de tocar) se
  actualiza a `/distritos`.

### 1.3 Precisión de scroll en mobile

`globals.css` tiene `scroll-padding-top: 100px` fijo (línea ~68) y
`section[id], div[id] { scroll-margin-top: 100px }` (línea ~73), pensado para
el header con la franja azul. Al quitar esa franja (1.1) el header sticky en
mobile mide menos → el valor fijo se queda grande. Se reemplaza por un valor
responsive (media query o `clamp()`) calculado sobre la altura real del header
sin franja en mobile vs. desktop, y se verifica que los anclas que quedan
(`#bio`, `#objetivos`, `#participa` en `MobileBottomNav`, y `#secciones` en
`HomeTabs`) laten bien con el nuevo valor — sin franja, sin pestaña "lugares"
de por medio.

## 2. Admin — Hero Settings: archivo primero, link secundario

Auditado: de los 8 paneles con imagen/video (Hero, Candidate Profile, Gallery,
Campaign Videos, Team, Achievements, Testimonials, Proposals/Videos), **solo
Hero Settings** antepone la URL al archivo. El resto ya es upload-first sin
cambios necesarios.

`resources/js/src/app/admin/hero-settings/page.tsx`:
- `videoMode` inicial pasa de `"url"` a `"upload"`.
- El toggle "Subir archivo" / "URL directa" deja de ser dos pestañas de igual
  peso. "Subir archivo" es el modo por defecto y visualmente primario; "URL
  directa" se convierte en un link secundario tipo *"¿Prefieres pegar un
  enlace en vez de subir el archivo?"* que despliega el campo bajo demanda.
- Bug encontrado de paso: el uploader de la imagen de fondo (fallback) está
  anidado dentro de la rama `videoMode === "url"` — con Upload como default,
  nunca es alcanzable. Se saca de esa rama para que sea siempre visible,
  independiente del modo de video elegido.

## Fuera de alcance

- Aviso de almacenamiento efímero (Render free tier) — pospuesto, sin cambios
  de código en este ciclo.
- Cualquier cambio a `CivicAIService`, prompts, o modelos de datos — no aplica,
  este trabajo es puramente de UI/routing del sitio público y un panel admin.

## Testing

- Frontend: `npm run build` (typecheck) tras los cambios; revisión visual
  manual en viewport mobile (375px) de Navbar, Footer, Hero, `/distritos`, y
  el scroll de anclas del `MobileBottomNav`.
- No hay cambios de backend/API en este spec — no aplica `php artisan test`.
