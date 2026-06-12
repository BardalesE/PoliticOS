# PoliticOS v2 — Patch de Inteligencia Electoral

Sistema de asistente conversacional con IA para campañas políticas, evolucionado desde la base de PoliticOS v1 (James Cueva).

## Qué cambia respecto a v1

| Área | v1 | v2 |
|---|---|---|
| RAG | `LIKE '%word%'` en BD | FULLTEXT MATCH (default) o Qdrant vector store (opcional) |
| Análisis de mensajes | Solo respuesta | Async: sentiment + emotion + intent + concerns + segmento + ataque detectado |
| Detección de ataques | No existe | Plantillas editables, detección por keywords + sinónimos, redirección a propuesta |
| System prompt | Fijo, hardcodeado a James | Dinámico con placeholders por tenant: {{candidate_name}}, {{personality}}, segmento detectado, etc. |
| Captura ciudadana | Solo IP + UA | Visitor UUID persistente + datos voluntarios con consentimiento (Ley 29733) |
| Compliance | Implícito | Modal de consentimiento, badge persistente "IA no es candidato", divulgación obligatoria en system prompt |
| Inteligencia | Métricas básicas | Dashboard 3 tabs: pulso ciudadano (sentimientos/emociones/geografía), feed de ataques, segmentación |
| Alertas | No existe | Job programado cada 5min: spike de ataques, drop de sentimiento, tema viral |
| Fuentes externas | No existe | Servicio Python (Docker) que scrapea RSS / YouTube / Twitter y los pushea al backend |
| Streaming SSE | Existe | Conservado + chunking + cookie del visitor |
| Prompt injection | Sin protección | Sanitización con regex de patrones comunes |

## Stack

**Backend (Laravel 12):** sin cambios de infra. Solo agrega tablas, jobs, controllers, servicios.
**Frontend (Next.js 15):** sin cambios de stack. Agrega páginas en `/admin/*` y componentes en `/components/chat`.
**Ingesta (nuevo, Python + Docker):** FastAPI + Celery + Redis + Qdrant (todo opcional, levantar solo si quieres feed externo y vector store).

## Estructura del patch

```
politicos-v2-patch/
├── README.md                  (este archivo)
├── INSTALL.md                 (instalación paso a paso para Hector)
├── DEPLOYMENT.md              (VPS, Nginx, scheduler, queue worker)
├── LEGAL_COMPLIANCE.md        (Ley 29733 + JNE + texto de consentimiento)
├── SUPER_PROMPT.md            (documentación del prompt maestro v2)
├── backend/                   (copiar dentro del proyecto Laravel)
│   ├── app/
│   ├── database/migrations/   (10 migraciones nuevas)
│   ├── database/seeders/      (3 seeders nuevos)
│   ├── resources/prompts/     (prompt maestro v2)
│   ├── routes/                (api.php + console.php)
│   └── config/services.php
├── frontend/                  (copiar dentro de resources/js/)
│   └── src/
│       ├── app/admin/intelligence/
│       ├── app/admin/attack-responses/
│       ├── app/admin/external-signals/
│       ├── app/chat/page.tsx  (reemplaza al existente)
│       └── components/chat/
└── ingest/                    (carpeta independiente, levantar con docker compose)
    ├── docker-compose.yml
    ├── Dockerfile, requirements.txt, .env.example
    ├── app.py                 (FastAPI)
    ├── workers/               (rss_scraper, youtube_comments, twitter_listener)
    └── processors/            (classifier, embedder)
```

## Orden de instalación

1. **Lee `INSTALL.md`** (paso a paso, copia-pega).
2. **Copia archivos backend** y corre migraciones + seeder v2.
3. **Copia archivos frontend** y rebuild.
4. **(Opcional)** Levanta el stack de ingesta Python con `docker compose up -d`.
5. **Configura el tenant Keiko** y/o **JP** con sus PDFs, propuestas y biografía.
6. **Smoke test:** envía 5 mensajes al chat y revisa `/admin/intelligence`.

## Modo de operación recomendado para la segunda vuelta (7 jun)

- **Hoy → 5 jun:** Tener tenants `keiko.politicos.pe` y `jp.politicos.pe` operativos como **comparador ciudadano neutral**. Landing pública: "Habla con los dos candidatos antes de votar".
- **5–6 jun:** Push viral en redes (no buying votes, sí formato neutral informativo).
- **7 jun (día de elección):** No campañeas (veda electoral). Tu producto es informativo, sigue operando.
- **8 jun → octubre:** Vender el SaaS a candidatos regionales/municipales para 2026 con caso de éxito real.

## Costos operativos estimados (mes)

- VPS 4 vCPU / 8 GB (Hetzner CPX31): **€16 / mes** (~$70 soles)
- Groq Llama-3.3-70B: ~**$5–15** según volumen (mensajes del chat)
- Claude Haiku 4.5 (fallback): ~**$10–25** según volumen
- OpenAI embeddings (opcional, si activas Qdrant): ~**$2–8**
- YouTube Data API: gratis (10k unidades/día)
- RSS scraping: gratis
- Twitter API v2 Basic (opcional): **$200/mes** — saltar si tu budget es bajo

**Costo mínimo viable:** ~$40 USD/mes (sin Twitter, sin Qdrant, con Groq como primary).

## Soporte

Arquitecto: Elian Bardales · Implementación: Hector Sánchez.
