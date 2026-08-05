# Mobile-first del sitio público + medios en admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adaptar el sitio público a celulares (quitar el badge "Portal de Transparencia", unificar "Lugares Visitados"/"Caseríos" en un solo link directo "Mi Comunidad", precisión de scroll en mobile) y hacer que `/admin/hero-settings` suba archivo por defecto en vez de pedir un link.

**Architecture:** Cambios de UI/routing puros en componentes Next.js/React existentes (`resources/js/src/`) — sin cambios de backend, modelos ni migraciones. Cada tarea toca un archivo, es independiente y se verifica con `npm run build` (typecheck) más grep de las cadenas viejas/nuevas.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Tailwind CSS.

## Global Constraints

- No modificar `CivicAIService`, prompts, ni nada de `app/` (Laravel) — este trabajo es 100% frontend.
- Todos los componentes de cliente llevan `"use client"` (ya presente en los archivos tocados, no se retira).
- Fuera de alcance: el aviso de almacenamiento efímero (Render free tier) — pospuesto por decisión explícita del usuario, ningún task lo toca.
- Cada task termina con `npm run build` limpio (typecheck) antes de comitear.

---

### Task 1: Navbar — quitar badge "Portal de Transparencia" y renombrar "Lugares Visitados" → "Mi Comunidad"

**Files:**
- Modify: `resources/js/src/components/ui/Navbar.tsx`

**Interfaces:**
- Consumes: nada nuevo — sigue usando `useCandidate()`, `TenantLink`, `usePathname` como hoy.
- Produces: nada que otros tasks consuman directamente (Task 2-4 tocan otros archivos con la misma etiqueta "Mi Comunidad" por separado).

- [ ] **Step 1: Quitar el import de `Shield` (ya no se usa tras retirar el badge)**

```tsx
// Antes:
import { Menu, X, Shield, ChevronRight } from "lucide-react";
// Después:
import { Menu, X, ChevronRight } from "lucide-react";
```

- [ ] **Step 2: Renombrar la entrada de navegación**

```tsx
// Antes (dentro de NAV_DEFS):
  { href: "/distritos",  label: "Lugares Visitados" },
// Después:
  { href: "/distritos",  label: "Mi Comunidad" },
```

- [ ] **Step 3: Eliminar la franja azul superior completa**

Borrar este bloque (queda dentro de `<header className="sticky top-0 z-50 w-full">`, justo antes del comentario `{/* Header principal */}`):

```tsx
        {/* Top bar — azul institucional */}
        <div className="bg-brand-700">
          <div className="mx-auto max-w-7xl px-5 py-2 flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold text-white/80 hidden sm:block">
              {profile.party || "Campaña Electoral"} · {profile.location}
            </span>
            <span className="text-[11px] font-semibold text-white/80 sm:hidden">
              Lista N°{profile.list_number} · {profile.location}
            </span>
            <TenantLink
              href="/?seccion=documentos"
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white
                         text-[10px] sm:text-[11px] font-bold uppercase px-3 py-1.5 rounded-full
                         transition-colors shrink-0 border border-white/20"
            >
              <Shield size={10} />
              <span className="hidden sm:inline">Portal de Transparencia</span>
              <span className="sm:hidden">Transparencia</span>
            </TenantLink>
          </div>
        </div>

```

El `<header>` debe quedar así justo después del cambio (el comentario "Header principal" pasa a ser el primer hijo):

```tsx
      <header className="sticky top-0 z-50 w-full">

        {/* Header principal */}
        <div
```

- [ ] **Step 4: Verificar**

```bash
cd resources/js && npm run build
```
Expected: build sin errores de TypeScript (no debe quedar ninguna referencia a `Shield` sin usar ni a `videoMode`... espera, eso es Task 6 — aquí solo verificar que `Navbar.tsx` compila).

Confirmar visualmente que las cadenas viejas ya no existen:
```bash
grep -n "Portal de Transparencia\|Lugares Visitados" resources/js/src/components/ui/Navbar.tsx
```
Expected: sin resultados.

- [ ] **Step 5: Commit**

```bash
git add resources/js/src/components/ui/Navbar.tsx
git commit -m "feat(navbar): quita badge Portal de Transparencia, renombra a Mi Comunidad

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Footer — colapsar "Caseríos" + "Lugares Visitados" en un solo link "Mi Comunidad"

**Files:**
- Modify: `resources/js/src/components/ui/Footer.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada.

- [ ] **Step 1: Editar `contentLinks` — relabel "Caseríos" → "Mi Comunidad"**

```tsx
// Antes:
const contentLinks = [
  { href: "/propuestas",           label: "Propuestas" },
  { href: "/distritos",            label: "Caseríos" },
  { href: "/galeria",              label: "Galería" },
  { href: "/videos",               label: "Videos" },
  { href: "/?seccion=documentos",  label: "Documentos" },
];
// Después:
const contentLinks = [
  { href: "/propuestas",           label: "Propuestas" },
  { href: "/distritos",            label: "Mi Comunidad" },
  { href: "/galeria",              label: "Galería" },
  { href: "/videos",               label: "Videos" },
  { href: "/?seccion=documentos",  label: "Documentos" },
];
```

- [ ] **Step 2: Quitar la entrada duplicada de `participaLinks`**

```tsx
// Antes:
const participaLinks = [
  { href: "/?seccion=eventos",  label: "Agenda" },
  { href: "/?seccion=lugares",  label: "Lugares Visitados" },
  { href: "/en-vivo",           label: "En vivo" },
  { href: "/chat",              label: "Chatbot IA" },
];
// Después:
const participaLinks = [
  { href: "/?seccion=eventos",  label: "Agenda" },
  { href: "/en-vivo",           label: "En vivo" },
  { href: "/chat",              label: "Chatbot IA" },
];
```

- [ ] **Step 3: Verificar**

```bash
grep -n "Caseríos\|/?seccion=lugares" resources/js/src/components/ui/Footer.tsx
```
Expected: sin resultados.

```bash
cd resources/js && npm run build
```
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add resources/js/src/components/ui/Footer.tsx
git commit -m "feat(footer): colapsa Caseríos/Lugares Visitados en un solo link Mi Comunidad

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Hero — "Mi zona" (GPS) navega directo a /distritos

**Files:**
- Modify: `resources/js/src/components/landing/Hero.tsx`

**Interfaces:**
- Consumes: `goTenant(href: string)` ya definido en el mismo archivo (sin cambios de firma).
- Produces: nada.

- [ ] **Step 1: Cambiar el destino y actualizar el comentario**

```tsx
// Antes:
  // "Mi zona": mismo mecanismo GPS del navegador que ya usa el chat (browser_lat/lng).
  // TODO: mapear lat/lng → distrito cuando la API exponga ese lookup; mientras
  // tanto abre la pestaña "Lugares Visitados" (Fase 7: la sección ya no es un
  // ancla scrolleable, vive detrás de la pestaña ?seccion=lugares).
  const handleMyZone = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      () => goTenant("/?seccion=lugares"),
      () => {} // silencioso si deniega, igual que en el chat
    );
  };

// Después:
  // "Mi zona": mismo mecanismo GPS del navegador que ya usa el chat (browser_lat/lng).
  // TODO: mapear lat/lng → distrito cuando la API exponga ese lookup; mientras
  // tanto abre /distritos directo (la sección dejó de vivir detrás de una
  // pestaña del home — un solo destino directo, más preciso en mobile).
  const handleMyZone = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      () => goTenant("/distritos"),
      () => {} // silencioso si deniega, igual que en el chat
    );
  };
```

- [ ] **Step 2: Verificar**

```bash
grep -n "seccion=lugares" resources/js/src/components/landing/Hero.tsx
```
Expected: sin resultados.

```bash
cd resources/js && npm run build
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add resources/js/src/components/landing/Hero.tsx
git commit -m "feat(hero): 'Mi zona' navega directo a /distritos en vez de la pestaña del home

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: HomeTabs — quitar la pestaña duplicada "lugares"

**Files:**
- Modify: `resources/js/src/components/landing/HomeTabs.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada — `Districts` sigue viviendo en `/distritos` (`resources/js/src/app/distritos/page.tsx`, sin cambios).

- [ ] **Step 1: Quitar el import de `Districts` (deja de usarse en este archivo)**

```tsx
// Antes:
import { Proposals }        from "@/components/landing/Proposals";
import { EventsSection }    from "@/components/landing/EventsSection";
import { MediaSection }     from "@/components/landing/MediaSection";
import { Districts }        from "@/components/landing/Districts";
import { TeamSection }      from "@/components/landing/TeamSection";
import { DocumentsSection } from "@/components/landing/DocumentsSection";

// Después:
import { Proposals }        from "@/components/landing/Proposals";
import { EventsSection }    from "@/components/landing/EventsSection";
import { MediaSection }     from "@/components/landing/MediaSection";
import { TeamSection }      from "@/components/landing/TeamSection";
import { DocumentsSection } from "@/components/landing/DocumentsSection";
```

- [ ] **Step 2: Quitar la entrada `lugares` de `TABS` y actualizar el comentario**

```tsx
// Antes:
// Las 7 pestañas de la home (orden validado en el mockup rigo_home_7tabs).
// `flag` es el toggle de home-settings que puede apagar la pestaña por tenant;
// "En Vivo" no tiene flag (igual que LiveStreamBanner, siempre disponible).
const TABS = [
  { slug: "propuestas", label: "Propuestas",            flag: "show_proposals" },
  { slug: "eventos",    label: "Eventos y Cronómetro",  flag: "show_events" },
  { slug: "en-vivo",    label: "En Vivo",               flag: null },
  { slug: "galeria",    label: "Galería",               flag: "show_multimedia" },
  { slug: "lugares",    label: "Lugares Visitados",     flag: "show_districts" },
  { slug: "equipo",     label: "Equipo",                flag: "show_team" },
  { slug: "documentos", label: "Base del Conocimiento", flag: "show_documents" },
] as const;

// Después:
// Las 6 pestañas de la home (antes 7 — "Lugares Visitados" se retiró: ya no
// duplica /distritos, que ahora es el único destino directo, ver spec
// docs/superpowers/specs/2026-08-05-mobile-y-medios-admin-design.md).
// `flag` es el toggle de home-settings que puede apagar la pestaña por tenant;
// "En Vivo" no tiene flag (igual que LiveStreamBanner, siempre disponible).
const TABS = [
  { slug: "propuestas", label: "Propuestas",            flag: "show_proposals" },
  { slug: "eventos",    label: "Eventos y Cronómetro",  flag: "show_events" },
  { slug: "en-vivo",    label: "En Vivo",               flag: null },
  { slug: "galeria",    label: "Galería",               flag: "show_multimedia" },
  { slug: "equipo",     label: "Equipo",                flag: "show_team" },
  { slug: "documentos", label: "Base del Conocimiento", flag: "show_documents" },
] as const;
```

- [ ] **Step 3: Quitar el render de la pestaña**

```tsx
// Antes:
      {active === "en-vivo" && <EnVivoPanel />}
      {active === "galeria" && (
        <MediaSection initialPhotos={props.initialGallery} initialVideos={props.initialVideos} />
      )}
      {active === "lugares" && <Districts />}
      {active === "equipo" && <TeamSection initialMembers={props.initialTeam} />}

// Después:
      {active === "en-vivo" && <EnVivoPanel />}
      {active === "galeria" && (
        <MediaSection initialPhotos={props.initialGallery} initialVideos={props.initialVideos} />
      )}
      {active === "equipo" && <TeamSection initialMembers={props.initialTeam} />}
```

- [ ] **Step 4: Verificar**

```bash
grep -n '"lugares"\|Districts' resources/js/src/components/landing/HomeTabs.tsx
```
Expected: sin resultados (ni el import ni ninguna referencia al slug).

```bash
cd resources/js && npm run build
```
Expected: sin errores (si `Districts` quedara importado sin usar, TypeScript no falla el build por defecto en Next, pero igual no debe quedar — confirmado por el grep de arriba).

- [ ] **Step 5: Commit**

```bash
git add resources/js/src/components/landing/HomeTabs.tsx
git commit -m "feat(home): quita la pestaña 'lugares', que duplicaba /distritos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: globals.css — offset de scroll responsive (sin la franja azul)

**Files:**
- Modify: `resources/js/src/app/globals.css`

**Interfaces:**
- Consumes: nada — CSS puro.
- Produces: nada.

Contexto: el header sticky mide `h-16` (64px) en mobile y `h-[68px]` desde el
breakpoint `sm:` (640px) en `Navbar.tsx` — ya sin la franja de "Portal de
Transparencia" que se quitó en el Task 1. El `scroll-padding-top`/
`scroll-margin-top` fijo en 100px quedó sobredimensionado; se reemplaza por un
valor por breakpoint que sigue el mismo corte `sm:` que usa el propio Navbar.

- [ ] **Step 1: Reemplazar el bloque de scroll offset**

```css
/* Antes: */
  html, body {
    @apply bg-white text-gray-900 antialiased;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    /* Compensa el navbar sticky al hacer scroll a secciones */
    scroll-padding-top: 100px;
  }

  /* Toda sección con id respeta el offset del navbar sticky */
  section[id], div[id] {
    scroll-margin-top: 100px;
  }

/* Después: */
  html, body {
    @apply bg-white text-gray-900 antialiased;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    /* Compensa el navbar sticky al hacer scroll a secciones — el header mide
       h-16 (64px) en mobile y h-[68px] desde `sm:` (ver Navbar.tsx), ya sin
       la franja de "Portal de Transparencia" que se retiró. */
    scroll-padding-top: 76px;
  }

  @media (min-width: 640px) {
    html, body {
      scroll-padding-top: 84px;
    }
  }

  /* Toda sección con id respeta el offset del navbar sticky */
  section[id], div[id] {
    scroll-margin-top: 76px;
  }

  @media (min-width: 640px) {
    section[id], div[id] {
      scroll-margin-top: 84px;
    }
  }
```

- [ ] **Step 2: Verificar**

```bash
grep -n "scroll-padding-top\|scroll-margin-top" resources/js/src/app/globals.css
```
Expected: cuatro apariciones (76px y 84px, cada una dos veces — una para `html, body` y una para `section[id], div[id]`), ninguna con `100px`.

```bash
cd resources/js && npm run build
```
Expected: sin errores.

Verificación manual (no automatizable sin Playwright, y no hay suite unitaria
en este repo): abrir el sitio en un viewport de 375px, tocar cada botón del
`MobileBottomNav` (Historia, Propuestas, Participa) y confirmar que la sección
destino queda completamente visible debajo del header, no tapada ni con hueco
grande de más.

- [ ] **Step 3: Commit**

```bash
git add resources/js/src/app/globals.css
git commit -m "fix(mobile): offset de scroll responsive tras quitar la franja del navbar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Admin Hero Settings — subir archivo por defecto, URL como opción secundaria colapsada

**Files:**
- Modify: `resources/js/src/app/admin/hero-settings/page.tsx`

**Interfaces:**
- Consumes: `adminApi.heroSettings.get/update/uploadVideo`, `adminApiExtended.candidateProfile.uploadPhoto`, `FormField` — todo sin cambios de firma.
- Produces: nada que otro task consuma.

Contexto: hoy el toggle "Subir archivo"/"URL directa" abre en modo URL por
defecto y pesa lo mismo que "Subir archivo". Además el uploader de la imagen
de fondo (fallback) está anidado dentro de la rama `videoMode === "url"`, así
que si el admin nunca toca esa pestaña, no puede subir la imagen de fallback
— bug de paso que se corrige aquí sacándolo a una sección siempre visible.

- [ ] **Step 1: Reemplazar el estado `videoMode` por `showUrlField`**

```tsx
// Antes:
  const [videoMode, setVideoMode]     = useState<"url" | "upload">("url");
// Después:
  const [showUrlField, setShowUrlField] = useState(false);
```

- [ ] **Step 2: Reemplazar todo el cuerpo de la card "Video de fondo"**

Buscar el bloque que empieza en `{/* ── Video de fondo ── */}` con el div
`<div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">`
y termina justo antes de `{/* Overlay opacity — always visible */}`. Reemplazar
todo su contenido interno (los hijos directos de ese div) por:

```tsx
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Video de fondo</p>

          {/* Current video preview */}
          {currentVideo && (
            <div className="relative rounded-xl overflow-hidden bg-black border border-white/10 aspect-video">
              <video
                key={currentVideo}
                src={currentVideo}
                autoPlay muted loop playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-3">
                <p className="text-[10px] text-white/70 truncate font-mono">{currentVideo}</p>
              </div>
              {uploadState === "done" && (
                <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/90 text-white text-[10px] font-semibold">
                  <CheckCircle size={10} /> Subido
                </div>
              )}
            </div>
          )}

          {/* Subir archivo — modo primario, siempre visible */}
          <div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
                dragOver
                  ? "border-brand-500 bg-brand-500/10"
                  : "border-white/20 hover:border-brand-500/50 hover:bg-gray-50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/mov,video/ogg,video/quicktime"
                onChange={onFileChange}
                className="sr-only"
              />

              {uploadState === "uploading" ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={28} className="animate-spin text-brand-400" />
                  <p className="text-sm font-medium text-gray-900">Subiendo video...</p>
                  <div className="w-full max-w-xs bg-white/10 rounded-full h-2">
                    <div
                      className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400">{uploadProgress}%</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="h-14 w-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                    <Video size={24} className="text-brand-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 mb-1">
                      Arrastra tu video aquí
                    </p>
                    <p className="text-xs text-gray-400">
                      o haz clic para seleccionar · MP4, WebM, MOV · máx. 500 MB
                    </p>
                  </div>
                </div>
              )}
            </div>

            {uploadError && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                <AlertCircle size={13} />
                {uploadError}
              </div>
            )}

            {uploadState === "done" && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-400">
                <CheckCircle size={13} />
                Video subido. URL actualizada automáticamente — guarda para confirmar.
              </div>
            )}
          </div>

          {/* URL directa — opción secundaria, colapsada por defecto */}
          <div>
            {!showUrlField ? (
              <button
                type="button"
                onClick={() => setShowUrlField(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-brand-500 transition-colors"
              >
                <Link2 size={12} />
                ¿Prefieres pegar un enlace en vez de subir el archivo?
              </button>
            ) : (
              <div className="space-y-1.5">
                <FormField
                  label="URL del video de fondo"
                  value={form.video_url ?? ""}
                  onChange={(e) => { set("video_url", e.target.value); setPreviewFile(null); }}
                  placeholder="/hero.mp4  o  https://example.com/video.mp4"
                />
                <button
                  type="button"
                  onClick={() => setShowUrlField(false)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Ocultar
                </button>
              </div>
            )}
          </div>

          {/* Imagen de fondo (fallback) — siempre visible, independiente del modo de video elegido arriba */}
          <div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Imagen de fondo (fallback si no hay video)
            </p>
            <div
              onDragOver={(e) => { e.preventDefault(); setImgDragOver(true); }}
              onDragLeave={() => setImgDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setImgDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadImage(f); }}
              onClick={() => !form.image_url && imgInputRef.current?.click()}
              className={cn(
                "relative rounded-xl border-2 overflow-hidden transition-all duration-200",
                form.image_url
                  ? "border-gray-200 cursor-default"
                  : imgDragOver
                  ? "border-brand-500 bg-brand-50 cursor-pointer"
                  : "border-dashed border-gray-200 hover:border-brand-400 hover:bg-gray-50 cursor-pointer"
              )}
            >
              <input
                ref={imgInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }}
              />
              {form.image_url ? (
                <div className="relative group aspect-video">
                  <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                    <button type="button" onClick={(e) => { e.stopPropagation(); imgInputRef.current?.click(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-gray-900 text-xs font-medium">
                      <Upload size={12} /> Cambiar imagen
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); set("image_url", ""); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/90 text-white text-xs font-medium">
                      <X size={12} /> Quitar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-8">
                  {imgUploading ? (
                    <Loader2 size={22} className="animate-spin text-brand-400" />
                  ) : (
                    <>
                      <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
                        <Image size={18} className="text-brand-500" />
                      </div>
                      <p className="text-xs text-gray-500">
                        Arrastra aquí o <span className="text-brand-500 font-medium">haz clic</span> para subir
                      </p>
                      <p className="text-[10px] text-gray-400">JPG, PNG, WebP · máx. 10 MB</p>
                    </>
                  )}
                </div>
              )}
            </div>
            {imgError && (
              <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle size={11} /> {imgError}
              </p>
            )}
          </div>
```

Nada de `dragOver`, `setDragOver`, `uploadState`, `uploadProgress`,
`uploadError`, `fileInputRef`, `onFileChange`, `onDrop`, `imgDragOver`,
`imgUploading`, `imgError`, `imgInputRef`, `uploadImage`, `cn`, `set`, `form`
cambia de firma — son los mismos handlers y estado que ya existían en el
archivo, solo se reordena el JSX que los usa.

- [ ] **Step 3: Verificar que no quedan referencias a `videoMode`**

```bash
grep -n "videoMode" resources/js/src/app/admin/hero-settings/page.tsx
```
Expected: sin resultados.

- [ ] **Step 4: Verificar el build**

```bash
cd resources/js && npm run build
```
Expected: sin errores de TypeScript (confirma que `showUrlField`/`setShowUrlField`
son las únicas referencias al estado del toggle, y que ningún handler quedó huérfano).

- [ ] **Step 5: Verificación manual**

Con el backend corriendo (`php artisan serve`) y el frontend (`npm run dev`),
entrar a `/admin/hero-settings` y confirmar:
1. La zona de "Subir archivo" se ve de entrada, sin tocar nada.
2. El link "¿Prefieres pegar un enlace...?" despliega el campo de URL al
   hacer clic, y "Ocultar" lo vuelve a colapsar.
3. La sección "Imagen de fondo (fallback)" es visible siempre, sin depender
   de haber abierto el campo de URL.

- [ ] **Step 6: Commit**

```bash
git add resources/js/src/app/admin/hero-settings/page.tsx
git commit -m "feat(admin): Hero Settings sube archivo por defecto, URL pasa a opción secundaria

Corrige de paso que el fallback de imagen solo era alcanzable en modo URL.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** 1.1 (badge) → Task 1. 1.2 (unificar Mi Comunidad) → Tasks 1-4. 1.3 (scroll) → Task 5. 2 (Hero Settings archivo-primero) → Task 6. "Fuera de alcance" (aviso de storage efímero) → sin task, correcto.
- **Placeholder scan:** ningún TBD/TODO nuevo introducido; los TODOs preexistentes que se tocan (Hero.tsx) se preservan intencionalmente porque siguen vigentes (mapeo lat/lng → distrito).
- **Type consistency:** `showUrlField`/`setShowUrlField` se define una sola vez (Task 6, Step 1) y se usa consistentemente en el Step 2 del mismo task — no hay otro archivo que lo consuma.
- **Scope:** cada task es un archivo, autocontenido, verificable con build + grep sin depender de que otro task ya se haya aplicado (excepto que Task 5 asume que Task 1 ya quitó la franja azul — están numerados en orden de dependencia).
