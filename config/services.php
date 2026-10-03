<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'ses' => [
        'key'    => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel'              => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | AI Providers
    |--------------------------------------------------------------------------
    */

    'ai' => [
        'provider'      => env('AI_PROVIDER', 'groq'),
        'claude_key'    => env('ANTHROPIC_API_KEY'),
        'claude_model'  => env('CLAUDE_MODEL', 'claude-haiku-4-5-20251001'),
        'openai_key'    => env('OPENAI_API_KEY'),
        'openai_model'  => env('OPENAI_MODEL', 'gpt-4o-mini'),
        // El slot "openai" acepta cualquier API compatible con el formato
        // /chat/completions de OpenAI — no solo OpenAI. Sirve para enchufar un
        // segundo proveedor de respaldo sin tocar código: basta apuntar esta
        // URL + su key + su modelo. Ej. Gemini (tier gratis):
        //   OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
        //   OPENAI_API_KEY=<key de aistudio.google.com>
        //   OPENAI_MODEL=gemini-3.7-flash
        'openai_url'    => env('OPENAI_BASE_URL', 'https://api.openai.com/v1/chat/completions'),
        'groq_key'      => env('GROQ_API_KEY'),
        'groq_model'    => env('GROQ_MODEL', 'openai/gpt-oss-120b'),

        // ─── Respaldo gratuito (2026-10-03: caídas de Groq) ─────────
        // Todos hablan el formato /chat/completions de OpenAI. Entran AL FINAL de
        // la cadena (después de provider → fallback → último recurso), en este
        // orden, y solo los que tengan key. Sin key = no existe (sin costo, sin
        // requests condenados). Modelos y URLs cambiables por .env sin tocar código.
        'respaldo_orden' => env('AI_RESPALDO_GRATIS', 'cerebras,gemini,openrouter,mistral'),
        'respaldo' => [
            'cerebras' => [
                'url'   => env('CEREBRAS_BASE_URL', 'https://api.cerebras.ai/v1/chat/completions'),
                'key'   => env('CEREBRAS_API_KEY'),
                'model' => env('CEREBRAS_MODEL', 'gpt-oss-120b'),
            ],
            'gemini' => [
                'url'   => env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'),
                'key'   => env('GEMINI_API_KEY'),
                'model' => env('GEMINI_MODEL', 'gemini-2.5-flash'),
            ],
            'openrouter' => [
                'url'   => env('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1/chat/completions'),
                'key'   => env('OPENROUTER_API_KEY'),
                'model' => env('OPENROUTER_MODEL', 'openai/gpt-oss-120b:free'),
            ],
            'mistral' => [
                'url'   => env('MISTRAL_BASE_URL', 'https://api.mistral.ai/v1/chat/completions'),
                'key'   => env('MISTRAL_API_KEY'),
                'model' => env('MISTRAL_MODEL', 'mistral-small-latest'),
            ],
        ],
        // Segundos que un proveedor caído (429 / 5xx / timeout) se salta antes de
        // volver a probarlo: así el vecino no espera a Groq caído en cada mensaje.
        'enfriamiento_segundos' => (int) env('AI_ENFRIAMIENTO_SEGUNDOS', 60),

        // ─── Embeddings (RAG real) ──────────────────────────────────
        'embeddings_driver' => env('AI_EMBEDDINGS_DRIVER', 'mysql_fulltext'),
        'embeddings_model'  => env('EMBEDDINGS_MODEL', 'text-embedding-3-small'),
        'embeddings_dim'    => (int) env('EMBEDDINGS_DIM', 1536),
    ],

    /*
    |--------------------------------------------------------------------------
    | Qdrant (vector store, opcional)
    |--------------------------------------------------------------------------
    */

    'qdrant' => [
        'url'     => env('QDRANT_URL', 'http://localhost:6333'),
        'api_key' => env('QDRANT_API_KEY'),
    ],

    /*
    |--------------------------------------------------------------------------
    | GeoIP
    |--------------------------------------------------------------------------
    */

    'geoip' => [
        'maxmind_path' => env('MAXMIND_DB_PATH'), // /opt/geoip/GeoLite2-City.mmdb
    ],

    /*
    |--------------------------------------------------------------------------
    | Servicio de Ingesta externa (Python)
    |--------------------------------------------------------------------------
    */

    'ingest' => [
        'url' => env('INGEST_SERVICE_URL', 'http://localhost:8001'),
        // Secreto compartido con el servicio Python. Valida el header
        // X-Ingest-Key en POST /api/admin/external-signals/ingest.
        'key' => env('INGEST_KEY'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Revalidación del frontend Next.js (SaaS: cambios instantáneos)
    |--------------------------------------------------------------------------
    | Tras guardar branding/contenido desde el admin, Laravel avisa al route
    | handler /api/revalidate del frontend para que el ISR de Next.js
    | refresque de inmediato en vez de esperar su TTL natural (30-120s). Usa
    | FRONTEND_URL (ya existe para CORS) + un secreto dedicado.
    */

    'revalidate' => [
        'url'    => env('FRONTEND_URL'),
        'secret' => env('REVALIDATE_SECRET'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Cron externo (GitHub Actions) — sustituto de un cron real de servidor
    |--------------------------------------------------------------------------
    | POST /api/system/run-scheduler, protegido por X-Scheduler-Key. Ver
    | .github/workflows/scheduler.yml (dispara cada 5 min, gratis).
    */

    'scheduler' => [
        'key' => env('SCHEDULER_KEY'),
    ],

];
