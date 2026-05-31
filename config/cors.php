<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_filter([
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        env('FRONTEND_URL', ''),
    ]),

    // In production this matches https://*.politicos.pe
    // Set CORS_ALLOWED_PATTERN=https://([a-z0-9-]+\.)?politicos\.pe in .env
    'allowed_origins_patterns' => array_filter([
        env('CORS_ALLOWED_PATTERN', ''),
    ]),

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 86400,

    'supports_credentials' => true,
];
