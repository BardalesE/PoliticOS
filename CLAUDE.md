# PoliticOS — Documentación técnica

Plataforma de campaña política para James Cueva (candidato a alcalde, San Miguel, Perú).
Permite a ciudadanos chatear con un AI "James", explorar propuestas y ver videos.
El panel admin permite gestionar todo el contenido sin tocar código.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Laravel 12 / PHP 8.2 — API REST pura |
| Frontend | Next.js 15 / React 19 / TypeScript |
| Base de datos | MySQL — base: `bdpolitic` |
| Auth | Laravel Sanctum (Bearer tokens) |
| AI | Claude Haiku (Anthropic) — fallback OpenAI |
| CSS | Tailwind CSS 3.4 + Framer Motion + Recharts |

---

## Cómo correr el proyecto

### Backend (Laravel)
```bash
# 1. Instalar dependencias
composer install

# 2. Configurar entorno (copiar y editar)
cp .env.example .env
php artisan key:generate

# 3. Migrar y sembrar la base de datos
php artisan migrate --seed

# 4. Iniciar servidor
php artisan serve          # corre en http://localhost:8000
```

### Frontend (Next.js)
```bash
cd resources/js
npm install
# .env.local ya está configurado apuntando a http://localhost:8000/api
npm run dev                # corre en http://localhost:3000
```

### Credenciales de admin por defecto
```
Email:    admin@politicos.pe
Password: Admin2024!
```
Acceso: http://localhost:3000/admin/login

---

## Arquitectura

### Backend — `app/`

```
Http/
  Controllers/
    AuthController.php       → login / logout / me (Sanctum)
    AdminController.php      → CRUD: Proposals, Videos, FAQs, Users, ChatSessions
    AnalyticsController.php  → /api/analytics/summary (público) + /api/admin/analytics (admin)
    ChatController.php       → send / session (chat con James)
    ProposalController.php   → listado público de propuestas
    VideoController.php      → listado público de videos

  Middleware/
    EnsureIsAdmin.php        → valida role === 'admin' en rutas protegidas

Models/
  User.php            → id, name, email, role (admin|editor), password
  Proposal.php        → title, description, district, topic, budget, priority, status, image, document_url
  Video.php           → title, url, thumbnail, views, topic, published_at
  Faq.php             → question, answer, topic, priority
  ChatSession.php     → session_id (UUID), ip, user_agent, started_at → hasMany ChatMessage
  ChatMessage.php     → session_id (FK), role (user|james), content, topic, media (JSON)

Services/
  JamesAIService.php  → RAG simple + llamada a Claude/OpenAI + resolución de media
```

### Rutas API — `routes/api.php`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | /api/auth/login | — | Login admin, devuelve Bearer token |
| POST | /api/auth/logout | sanctum | Invalida token actual |
| GET | /api/auth/me | sanctum | Datos del usuario autenticado |
| POST | /api/chat | — | Envía mensaje a James AI |
| GET | /api/chat/session/{id} | — | Historial de sesión de chat |
| GET | /api/proposals | — | Listado de propuestas (filtros: district, topic) |
| GET | /api/proposals/{id} | — | Propuesta individual |
| GET | /api/videos | — | Listado de videos |
| GET | /api/analytics/summary | — | Métricas básicas del chat |
| GET | /api/admin/analytics | admin | Métricas completas del dashboard |
| GET/POST/PUT/DELETE | /api/admin/proposals/{id?} | admin | CRUD propuestas |
| GET/POST/PUT/DELETE | /api/admin/videos/{id?} | admin | CRUD videos |
| GET/POST/PUT/DELETE | /api/admin/faqs/{id?} | admin | CRUD FAQs |
| GET/POST/PUT/DELETE | /api/admin/users/{id?} | admin | CRUD usuarios |
| GET | /api/admin/chat-sessions | admin | Listado de sesiones |
| GET | /api/admin/chat-sessions/{id} | admin | Sesión con mensajes |

### Frontend — `resources/js/src/`

```
app/
  layout.tsx                  → Layout raíz (fuentes, metadata)
  page.tsx                    → Landing pública
  error.tsx                   → Error boundary global
  not-found.tsx               → Página 404
  chat/page.tsx               → Chat con James
  propuestas/page.tsx         → Propuestas públicas
  videos/page.tsx             → Videos públicos
  distritos/page.tsx          → Distritos
  admin/
    layout.tsx                → AuthProvider + guard de autenticación + sidebar
    loading.tsx               → Spinner de carga
    page.tsx                  → Dashboard con métricas y gráficas
    login/page.tsx            → Formulario de login admin
    proposals/page.tsx        → CRUD propuestas
    videos/page.tsx           → CRUD videos
    faqs/page.tsx             → CRUD FAQs
    users/page.tsx            → CRUD usuarios
    chat-sessions/page.tsx    → Viewer de conversaciones

components/
  ui/                         → Navbar, Footer, Button, GlassCard, ShareFab
  chat/                       → ChatBubble, ChatInput
  landing/                    → Hero, Proposals, Districts, Connection, FinalCTA
  admin/
    Sidebar.tsx               → Nav lateral del panel (con logout)
    Modal.tsx                 → Dialog animado (sm/md/lg/xl)
    ConfirmDialog.tsx         → Confirmación destructiva
    FormField.tsx             → Input / Textarea / Select unificados
    Pagination.tsx            → Paginación con ellipsis
    Badge.tsx                 → Badges de estado/rol
    PageHeader.tsx            → Header de página + SearchBar
    charts/
      ConversationsChart.tsx  → Area chart (conversaciones por día)
      TopicsChart.tsx         → Donut chart (distribución de temas)
      ProposalsStatusChart.tsx→ Bar chart (propuestas por estado)

context/
  AuthContext.tsx             → Token en localStorage, login/logout, useAuth hook

lib/
  api.ts                      → Cliente HTTP tipado: api (público) + adminApi (protegido)
  candidate.ts                → Datos del candidato (James Cueva)
  utils.ts                    → cn() (clsx + tailwind-merge)
  mockResponses.ts            → Respuestas mock para desarrollo sin backend

hooks/
  useChat.ts                  → Estado del chat (mensajes, sesión, envío)

types/
  auth.ts                     → AdminUser, AuthState
  chat.ts                     → Tipos del chat
```

---

## Convenciones

### Backend
- Validación **siempre en el controller** con `$request->validate([...])`
- Respuestas siempre `JsonResponse`
- Rutas admin protegidas con doble middleware: `['auth:sanctum', 'admin']`
- No modificar `JamesAIService` sin probar contra el prompt completo

### Frontend
- Todos los componentes de cliente llevan `"use client"` al inicio
- Usar `cn()` de `lib/utils` para clases condicionales
- Todas las llamadas admin usan `adminApi` con el `token` del `useAuth()` hook
- `FormField` soporta tres variantes: `as="input"` (default), `as="textarea"`, `as="select"`

### Base de datos
- Correr `php artisan migrate` después de cualquier nueva migración
- El seeder `AdminUserSeeder` usa `firstOrCreate` — es idempotente, seguro de re-ejecutar

---

## Variables de entorno requeridas

### Laravel (`.env`)
```env
DB_DATABASE=bdpolitic
DB_USERNAME=root
DB_PASSWORD=

AI_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...

SANCTUM_STATEFUL_DOMAINS=localhost:3000
FRONTEND_URL=http://localhost:3000
SESSION_DRIVER=cookie
SESSION_DOMAIN=localhost
```

### Next.js (`resources/js/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_USE_MOCK=false
```

---

## Reglas importantes

- No modificar `JamesAIService` sin validar contra los seeders (propuestas y FAQs deben existir)
- No eliminar la migración de `role` en `users` — el middleware `EnsureIsAdmin` depende de ese campo
- Siempre validar inputs en `FormRequest` o `$request->validate()`, nunca confiar en el frontend
- El token Sanctum se guarda en `localStorage` con key `admin_token`
- Un usuario no puede eliminarse a sí mismo (protegido en backend y frontend)
