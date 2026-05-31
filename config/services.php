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
        'claude_key'    => env('ANTHROPIC_API_KEY'),
        'claude_model'  => env('CLAUDE_MODEL', 'claude-haiku-4-5-20251001'),
        'openai_key'    => env('OPENAI_API_KEY'),
        'openai_model'  => env('OPENAI_MODEL', 'gpt-4o-mini'),
        'groq_key'      => env('GROQ_API_KEY'),
        'groq_model'    => env('GROQ_MODEL', 'llama-3.3-70b-versatile'),

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
        'url'    => env('INGEST_SERVICE_URL', 'http://localhost:8001'),
        'key'    => env('INGEST_SERVICE_KEY'),
    ],

];
