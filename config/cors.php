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
        // Previews de Vercel del proyecto (rama actual y cualquier futura):
        // politic-os-git-<rama>-hbardales2020-gmailcoms-projects.vercel.app,
        // el alias de proyecto sin "-git-…" y las URLs inmutables por deploy
        // (Vercel a veces acorta "politic-os" a "politic" en esas últimas).
        // Ancla en el subdominio exacto de ESTE team de Vercel — no abre CORS
        // a ningún otro dominio. Rutas de este grupo son GET públicas de solo
        // lectura (propuestas, candidato, galería…), sin credenciales de por
        // medio, así que ampliar el origen no expone nada sensible.
        '#^https://politic(-os)?(-[a-z0-9]+)*-hbardales2020-gmailcoms-projects\.vercel\.app$#',
    ]),

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 86400,

    'supports_credentials' => true,
];
