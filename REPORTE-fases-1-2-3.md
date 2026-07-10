# REPORTE — Fases URGENTE2 / PREP / Sistema de diseño

Rama: `feature/candidate-home-redesign` — 3 commits locales, **sin push ni merge**:

| Commit | Fase |
|--------|------|
| `249dcef` | fix(security): ocultar configuración interna del AI de `/api/candidate` |
| `a76f0f9` | feat: endpoint público `GET /api/knowledge` |
| `3e5c8bb` | feat(ui): sistema de diseño consolidado |

Fecha de verificación: 2026-07-09, contra servidor local real (`php artisan serve`,
puerto 8000) con datos del tenant `rigo` (BD `bdpolitic_rigo`). Sin tinker, sin
simulación: los JSON de abajo son la salida cruda de `curl`, formateada con
`python -m json.tool` (los `í` etc. son escapes Unicode de JSON, no datos
corruptos).

---

## 1. Curl real contra `GET /api/candidate` (fix de fuga)

Comando:

```bash
curl -s http://localhost:8000/api/candidate -H "X-Tenant: rigo" -H "Accept: application/json"
```

Respuesta completa (sin recortar):

```json
{
    "profile": {
        "id": 1,
        "preset_name": "Candidato principal",
        "is_active": true,
        "name": "peruprimero",
        "title": "Candidato a la Alcaldía",
        "location": "Por definir",
        "party": "Por definir",
        "list_number": "1",
        "bio": "Perfil de peruprimero. Editar desde el panel de administración.",
        "tagline": "Por el bien de todos",
        "election_date": "4 de octubre de 2026",
        "photo_url": "http://localhost:8000/storage/campaign/photos/pfKorxiKCNzE1cakZrRNxnyRu08FROcE3onRmq4u.jpg",
        "logo_url": "http://localhost:8000/storage/campaign/photos/bxSEiYSOokmGuHTYZPCF08G06Um7rG2OMkwdUPcm.jpg",
        "hero_photo_url": "http://localhost:8000/storage/campaign/photos/RybbmRgTDH1LjfM3DBFqRtI73gY5NwPZCjBfJfJE.jpg",
        "hero_video_url": null,
        "color_primary": "#f90b0b",
        "color_dark": "#1e1e1f",
        "color_accent": "#f4f3f1",
        "tiktok_url": null,
        "facebook_url": null,
        "instagram_url": null,
        "whatsapp_number": null,
        "created_at": "2026-06-24T00:58:01.000000Z",
        "updated_at": "2026-06-24T01:42:20.000000Z"
    },
    "suggested_questions": [],
    "topics": [
        { "name": "seguridad",    "label": "Seguridad Ciudadana", "emoji": "📋", "color": "#3B82F6" },
        { "name": "economia",     "label": "Economía y Empleo", "emoji": "📋", "color": "#3B82F6" },
        { "name": "salud",        "label": "Salud", "emoji": "📋", "color": "#3B82F6" },
        { "name": "educacion",    "label": "Educación", "emoji": "📋", "color": "#3B82F6" },
        { "name": "agua",         "label": "Agua y Saneamiento", "emoji": "📋", "color": "#3B82F6" },
        { "name": "transporte",   "label": "Transporte", "emoji": "📋", "color": "#3B82F6" },
        { "name": "vivienda",     "label": "Vivienda", "emoji": "📋", "color": "#3B82F6" },
        { "name": "agricultura",  "label": "Agricultura", "emoji": "📋", "color": "#3B82F6" },
        { "name": "corrupcion",   "label": "Anticorrupción", "emoji": "📋", "color": "#3B82F6" },
        { "name": "pension",      "label": "Pensiones", "emoji": "📋", "color": "#3B82F6" },
        { "name": "tecnologia",   "label": "Tecnología", "emoji": "📋", "color": "#3B82F6" },
        { "name": "juventud",     "label": "Juventud", "emoji": "📋", "color": "#3B82F6" },
        { "name": "mujer",        "label": "Mujer", "emoji": "📋", "color": "#3B82F6" },
        { "name": "mineria",      "label": "Minería", "emoji": "📋", "color": "#3B82F6" },
        { "name": "congreso",     "label": "Política", "emoji": "📋", "color": "#3B82F6" },
        { "name": "narcotrafico", "label": "Narcotráfico", "emoji": "📋", "color": "#3B82F6" }
    ],
    "districts": [],
    "chat_btn": {
        "text": null,
        "subtitle": "IA · 24/7",
        "shape": "pill",
        "color": null,
        "size": "md",
        "position": "bottom-right"
    }
}
```

> Nota: los objetos de `topics` se compactaron a una línea cada uno solo por
> legibilidad de este documento; son los 16 topics completos de la respuesta,
> sin omitir ninguno ni ningún campo.

Chequeo programático de los 8 campos sensibles sobre la respuesta cruda
(`grep` sobre el body completo):

```
ok (ausente): personality_traits      ok (ausente): priority_topics
ok (ausente): biography_long          ok (ausente): target_segments
ok (ausente): signature_phrases       ok (ausente): campaign_slogan
ok (ausente): forbidden_topics        ok (ausente): attack_response_style
```

**Mecanismo:** `$hidden` en `app/Models/CandidateProfile.php` (no API Resource).
Razones: el repo no usa API Resources en ninguna parte; ningún frontend
(público ni admin) lee estos campos — grep en `resources/js/src`: 0 matches, y
el `update()`/`createPreset()` del admin ni siquiera los validan; el único
consumidor es `CivicAIService`, que los lee por acceso de atributo, al cual
`$hidden` no afecta. Los 23 tests de Laravel pasan (70 aserciones).

---

## 2. Fase PREP — endpoint público `GET /api/knowledge`

**Problema:** `DocumentsSection.tsx` llamaba a `GET /api/knowledge`, que solo
existía como ruta admin con Sanctum. El fetch fallaba en silencio y el portal
de transparencia nunca se mostraba.

**Ruta:** `routes/api.php:76` — pública, dentro del grupo `api` global (pasa
por `ResolveTenant`, mismo patrón tenant-scoped que `/candidate` y
`/proposals`). Método nuevo `publicIndex()` en `KnowledgeDocumentController`;
el `index()` admin de `/api/admin/knowledge` queda intacto.

```
GET|HEAD  api/knowledge ... KnowledgeDocumentController@publicIndex
```

**Shape exacto** — curl real `curl -s http://localhost:8000/api/knowledge -H "X-Tenant: rigo"`,
respuesta completa:

```json
[
    {
        "id": 1,
        "title": "EL MAÑANERO DOC",
        "description": null,
        "topic": "economia",
        "file_url": "http://localhost:8000/storage/knowledge/WROQUndRqIqkZVU1E9Tvvn5DEuM9G9El9xkWXK2D.pdf",
        "source_url": "http://localhost:8000/storage/knowledge/WROQUndRqIqkZVU1E9Tvvn5DEuM9G9El9xkWXK2D.pdf",
        "source_type": "pdf",
        "file_size": 204417,
        "is_active": true,
        "created_at": "2026-06-24T01:32:13.000000Z"
    }
]
```

- **Array plano, sin paginación** (decisión deliberada: el admin pagina, pero
  el componente público hace `data.filter(...)` directo sobre un array, y una
  lista de documentos de transparencia no la necesita).
- **`content` NO se expone**: el query usa `->get([...])` con lista explícita
  de columnas — `content`, `chunks`, `embeddings_meta`, `embeddings_indexed` y
  `original_name` nunca salen (verificable en la respuesta de arriba).
- **Solo documentos activos**: `where('is_active', true)` — verificado contra
  la BD de `rigo` (1 activo de 1 total).

**Estado de `DocumentsSection.tsx` con datos reales:** recibe datos sin
necesitar ningún cambio de código. Usa exactamente `id`, `title`,
`description`, `topic`, `file_url`, `file_size`, `is_active` — todos presentes
con esos nombres. Su tipo TS `KnowledgeDocument` declara además
`original_name`/`content`/`candidate_id`, que ya no llegan en el endpoint
público, pero el componente no los usa (solo el admin, que conserva su
endpoint completo). No hay ajuste de shape pendiente.

---

## 3. Fase 1 — Sistema de diseño consolidado

### Tokens que ya existían (no se tocaron)

- Escala `brand-50→900` sobre `--brand-primary-rgb`/`--brand-dark-rgb` con
  `color-mix` (dinámica por tenant vía `CandidateContext`).
- Escala `ink` (negro institucional), paletas `gold`/`chat`/`trust`, tokens
  shadcn (`--background`, `--card`, `--muted`…).
- Tokens de página: `--page-bg/soft/ink/line/shadow`; derivados
  `--brand-grad/soft-bg/glow-10..40`.
- Fuentes: Inter (sans) + Source Serif 4 (serif/display).
- Clases legacy: `.h1-hero`, `.h2-serif`, `.btn-pp-*`, `.card-pp`, `.eyebrow-*`.

### Tokens completados (en los mismos archivos: `tailwind.config.ts` + `globals.css`)

- **`brand-300`**: `color-mix(... 50%, white)` — la escala saltaba de 200 a 400.
- **`--page-ink-soft: #4c5b51`**: nuevo token de texto secundario de página.
- **Tipografía**: escala `text-display/h1/h2/h3/body/small/caption` con
  line-height por nivel, mobile-first vía `clamp()` (consolida los valores
  exactos que las secciones ya usaban inline).
- **Radios**: `rounded-card` (20px), `rounded-modal` (24px).
- **Sombras**: `shadow-soft`, `shadow-lift`, `shadow-modal` (valores reales
  de las cards y modales de la landing).

### Componentes UI base (`resources/js/src/components/ui/`)

| Componente | Estado |
|---|---|
| `Button.tsx` | Ya existía; se agregó variante `secondary` (tenía primary/ghost/gold, sm/md/lg, disabled y loading con spinner) y se eliminó el `as any` del spread de props |
| `Card.tsx` | **Nuevo** — `rounded-card`, borde `--page-line`, padding none/sm/md, prop `shadow` |
| `Badge.tsx` | **Nuevo** — pill uppercase, variantes brand/soft/neutral |
| `Modal.tsx` | **Nuevo** — extraído del `ProposalModal` de `Proposals.tsx`; `Proposals.tsx` ya consume la versión genérica |
| `Section.tsx` | **Nuevo** — `py-20 md:py-28 px-5` + contenedor `max-w-5xl` centrado (variante `wide` = max-w-6xl) |

### Los 3 gaps de accesibilidad del modal — cerrados los tres en `Modal.tsx`

1. **Focus-trap** ✅ — Tab/Shift+Tab ciclan solo dentro del panel (query de
   elementos focusables + wrap manual en `keydown`).
2. **Retorno de foco** ✅ — guarda `document.activeElement` al montar y lo
   restaura al desmontar (al cerrar, el foco vuelve a la card que abrió el modal).
3. **Bloqueo de scroll del body** ✅ — `body.style.overflow = "hidden"`
   mientras está abierto, restaurando el valor previo al cerrar.

Se conservaron: cierre por Escape y por click fuera, `role="dialog"`,
`aria-modal="true"`, `aria-label`, animaciones Framer Motion (fade backdrop +
spring del panel, compatible con `AnimatePresence` para la salida).

### Los 4 quick wins, uno por uno

| # | Quick win | Estado real |
|---|-----------|-------------|
| 1 | `brand-300` faltante (usado por `Hero.tsx` como no-op) | ✅ **Corregido.** Escalón agregado al config; verificado que `.text-brand-300` ahora aparece en el CSS compilado de `next build` (antes no se generaba) |
| 2 | Clases `w-13/h-13`, `w-15/h-15` en `ChatFAB.tsx` (no existen en Tailwind 3.4) | ✅ **Corregido** a `w-12/h-12` (md) y `w-14/h-14` (lg) |
| 3 | 3 rutas con backslash en `lib/api.ts` (líneas 507, 514, 682) | ⚠️ **Ya estaban corregidas en el código actual** — las tres líneas usan `/`, y un grep de rutas con `\` en todo `api.ts` da 0 resultados. La auditoría se hizo sobre un estado anterior del archivo; no hubo nada que tocar |
| 4 | `#4c5b51` hardcodeado (~8 ocurrencias) | ✅ **Corregido.** Tokenizado como `--page-ink-soft`; el grep real encontró **9 ocurrencias en 5 archivos** (AssistantPreview ×2, Districts ×1, BioSection ×2, Proposals ×3, TeamSection ×1), todas reemplazadas; grep posterior: 0 restantes |

**Omitido (opcional según el plan):** la ruta interna `/dev/style-guide` — el
repo no tiene patrón de rutas de desarrollo/debug y el plan la marcaba como no
bloqueante.

**Cierre de fase:** `npx tsc --noEmit` sin errores y `npm run build` (Next.js)
exitoso.

---

## 4. Qué se escribió en memories y por qué

En el paso anterior se creó **un** archivo de memoria persistente
(`reference_frontend_plans.md`, tipo `reference`) más su línea en el índice
`MEMORY.md`. Contenido, en resumen:

1. **Ubicación de los planes**: los `frontend-plan-*.md` viven en
   `C:\Users\AcerBardales\Claude\Projects\Politicos\`, **fuera** del repo.
   Motivo: en esta sesión hubo que buscarlos por medio disco porque no están
   en `C:\laragon\www\PoliticOS`; con la nota, una sesión futura los encuentra
   directo.
2. **Estado de avance a julio 2026**: 00-URGENTE2, 00-PREP y 02 completados en
   `feature/candidate-home-redesign`; pendientes 03 (home candidato), 04
   (en-vivo) y 05 (responsive/QA). Motivo: es contexto de proyecto que no se
   puede derivar del código.
3. **Tu regla de trabajo**: nunca mergear/pushear
   `feature/candidate-home-redesign` a `main` — eso lo revisas tú. Motivo: es
   una instrucción tuya que debe sobrevivir entre sesiones para que ninguna
   sesión futura la viole por no conocerla.

No se guardó nada más: lo demás (arquitectura, fixes, convenciones) ya está en
el propio repo (`CLAUDE.md`, git history) o en memorias previas.
