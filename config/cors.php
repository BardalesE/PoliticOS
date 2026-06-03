<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_filter([
        env('FRONTEND_URL', ''),
    ]),

    // Dev: allow any localhost port (next dev may use 3000, 3001, 3002…)
    // Prod: set CORS_ALLOWED_PATTERN=https://([a-z0-9-]+\.)?politicos\.pe
    'allowed_origins_patterns' => array_filter([
        env('CORS_ALLOWED_PATTERN', ''),
        env('APP_ENV') === 'local' ? '#^http://localhost:\d+$#' : '',
        env('APP_ENV') === 'local' ? '#^http://127\.0\.0\.1:\d+$#' : '',
    ]),

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 86400,

    'supports_credentials' => true,
];
