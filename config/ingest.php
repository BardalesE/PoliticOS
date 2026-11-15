<?php

/**
 * Umbrales del pipeline de ingesta completa de documentos (extracción → chunking
 * → MAP/REDUCE con Groq → embeddings). Todo configurable por env, nada hardcodeado
 * en los servicios/jobs — ver CLAUDE.md "Reglas importantes".
 */
return [

    'extraction' => [
        // Tope de SEGURIDAD (no de negocio): evita agotar memoria con un PDF
        // anómalo. ~3M caracteres ≈ 1000+ páginas de texto corrido — un plan
        // de gobierno real (200-400 páginas) nunca lo alcanza. Si se alcanza,
        // PdfPageExtractor lo deja en el log (ver LOG_CHANNEL).
        'max_chars' => (int) env('INGEST_MAX_CHARS', 3_000_000),
    ],

    'chunking' => [
        // Fallback cuando no se detectan títulos de sección (numeración, "EJE",
        // "CAPÍTULO", mayúsculas sostenidas). ~4 chars/token en español.
        'fallback_tokens'  => (int) env('INGEST_CHUNK_FALLBACK_TOKENS', 1500),
        'overlap_tokens'   => (int) env('INGEST_CHUNK_OVERLAP_TOKENS', 200),
        'chars_per_token'  => (int) env('INGEST_CHARS_PER_TOKEN', 4),
    ],

    'map' => [
        // Modelo barato/rápido: un chunk por llamada, cientos de llamadas por doc.
        'model' => env('INGEST_MAP_MODEL', 'openai/gpt-oss-20b'),
        // Throttling conservador para el plan gratuito de Groq (ver
        // console.groq.com/docs/rate-limits). GroqThrottler los reparte entre
        // los jobs del batch con release()+backoff, no con sleep().
        'requests_per_minute' => (int) env('INGEST_MAP_RPM', 25),
        'tokens_per_minute'   => (int) env('INGEST_MAP_TPM', 18000),
        'max_retries'         => (int) env('INGEST_MAP_MAX_RETRIES', 5),
    ],

    'reduce' => [
        // Modelo grande: pocas llamadas (una por eje + una global), más contexto.
        'model' => env('INGEST_REDUCE_MODEL', 'openai/gpt-oss-120b'),
        'min_faqs' => (int) env('INGEST_REDUCE_MIN_FAQS', 30),
        'max_faqs' => (int) env('INGEST_REDUCE_MAX_FAQS', 50),
    ],

    'embeddings' => [
        // Swap de driver sin tocar código (misma idea que ai.embeddings_driver
        // en config/services.php, pero este es el motor de embeddings REALES
        // del pipeline de ingesta completa — no QdrantEmbeddings, inactivo).
        'driver' => env('INGEST_EMBEDDINGS_DRIVER', 'gemini'),

        'gemini' => [
            'api_key' => env('GEMINI_API_KEY'),
            // Verificado contra la doc oficial (2026): gemini-embedding-001,
            // Matryoshka — admite truncar la dimensión por defecto (3072) sin
            // reentrenar. 768 recomendado por Google como piso de calidad/costo.
            'model'      => env('INGEST_EMBEDDINGS_MODEL', 'gemini-embedding-001'),
            'dimensions' => (int) env('INGEST_EMBEDDINGS_DIM', 768),
            'base_url'   => env('GEMINI_EMBEDDINGS_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'),
            // Lotes chicos: el endpoint :batchEmbedContents reporta 429 erráticos
            // en el tier gratuito incluso bajo cuota — ver docs oficiales.
            'batch_size'   => (int) env('INGEST_EMBEDDINGS_BATCH_SIZE', 10),
            'max_retries'  => (int) env('INGEST_EMBEDDINGS_MAX_RETRIES', 5),
        ],
    ],

    // Fase 2 (consulta): presupuesto de contexto RAG en tokens, no en nº fijo de
    // fragmentos (reemplaza MAX_EXCERPTS=4 × EXCERPT_CHARS=1200 de MySQLFulltextEmbeddings).
    'query' => [
        'context_token_budget' => (int) env('INGEST_QUERY_CONTEXT_TOKENS', 6000),
        'faq_similarity_threshold' => (float) env('INGEST_FAQ_SIMILARITY_THRESHOLD', 0.85),
        'rag_top_k' => (int) env('INGEST_RAG_TOP_K', 6),
    ],

];
