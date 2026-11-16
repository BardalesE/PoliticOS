<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Queue Connection Name
    |--------------------------------------------------------------------------
    |
    | Laravel's queue supports a variety of backends via a single, unified
    | API, giving you convenient access to each backend using identical
    | syntax for each. The default queue connection is defined below.
    |
    */

    'default' => env('QUEUE_CONNECTION', 'database'),

    /*
    |--------------------------------------------------------------------------
    | Queue Connections
    |--------------------------------------------------------------------------
    |
    | Here you may configure the connection options for every queue backend
    | used by your application. An example configuration is provided for
    | each backend supported by Laravel. You're also free to add more.
    |
    | Drivers: "sync", "database", "beanstalkd", "sqs", "redis", "null"
    |
    */

    'connections' => [

        'sync' => [
            'driver' => 'sync',
        ],

        'database' => [
            'driver' => 'database',
            // SIEMPRE 'central', nunca 'mysql': TenantContext::run/ResolveTenant
            // reapuntan la conexión 'mysql' a la BD del tenant en curso, así que
            // un job despachado dentro de un tenant terminaría insertado en la
            // tabla `jobs` de ESA BD en vez de en la tabla `jobs` que el worker
            // (que no corre dentro de ningún tenant) efectivamente lee — los
            // jobs quedan huérfanos y nunca se procesan. 'central' es la única
            // conexión que ResolveTenant/TenantContext no tocan nunca.
            'connection' => env('DB_QUEUE_CONNECTION', 'central'),
            'table' => env('DB_QUEUE_TABLE', 'jobs'),
            'queue' => env('DB_QUEUE', 'default'),
            // DEBE ser mayor que el $timeout más largo de cualquier job que corra en
            // esta cola — si no, el worker todavía está procesando un job válido
            // (p. ej. EmbedDocumentSectionsJob/ProcessKnowledgeDocumentJob, timeout=300s,
            // o ReduceDocumentJob, timeout=180s — ver app/Jobs/*.php) cuando retry_after
            // ya pasó, y OTRO worker lo toma y lo corre en paralelo (doble ejecución).
            // 360 deja margen sobre el timeout más largo actual (300s).
            'retry_after' => (int) env('DB_QUEUE_RETRY_AFTER', 360),
            'after_commit' => false,
        ],

        'beanstalkd' => [
            'driver' => 'beanstalkd',
            'host' => env('BEANSTALKD_QUEUE_HOST', 'localhost'),
            'queue' => env('BEANSTALKD_QUEUE', 'default'),
            'retry_after' => (int) env('BEANSTALKD_QUEUE_RETRY_AFTER', 90),
            'block_for' => 0,
            'after_commit' => false,
        ],

        'sqs' => [
            'driver' => 'sqs',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'prefix' => env('SQS_PREFIX', 'https://sqs.us-east-1.amazonaws.com/your-account-id'),
            'queue' => env('SQS_QUEUE', 'default'),
            'suffix' => env('SQS_SUFFIX'),
            'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
            'after_commit' => false,
        ],

        'redis' => [
            'driver' => 'redis',
            'connection' => env('REDIS_QUEUE_CONNECTION', 'default'),
            'queue' => env('REDIS_QUEUE', 'default'),
            'retry_after' => (int) env('REDIS_QUEUE_RETRY_AFTER', 90),
            'block_for' => null,
            'after_commit' => false,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Job Batching
    |--------------------------------------------------------------------------
    |
    | The following options configure the database and table that store job
    | batching information. These options can be updated to any database
    | connection and table which has been defined by your application.
    |
    */

    'batching' => [
        // Mismo motivo que 'connections.database.connection' arriba: siempre
        // 'central', nunca la conexión 'mysql' reescribible por tenant.
        'database' => env('DB_QUEUE_CONNECTION', 'central'),
        'table' => 'job_batches',
    ],

    /*
    |--------------------------------------------------------------------------
    | Failed Queue Jobs
    |--------------------------------------------------------------------------
    |
    | These options configure the behavior of failed queue job logging so you
    | can control how and where failed jobs are stored. Laravel ships with
    | support for storing failed jobs in a simple file or in a database.
    |
    | Supported drivers: "database-uuids", "dynamodb", "file", "null"
    |
    */

    'failed' => [
        'driver' => env('QUEUE_FAILED_DRIVER', 'database-uuids'),
        // Mismo motivo que arriba: siempre 'central'.
        'database' => env('DB_QUEUE_CONNECTION', 'central'),
        'table' => 'failed_jobs',
    ],

];
