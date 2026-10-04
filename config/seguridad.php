<?php

/*
 * Blindaje de accesos (2026-10-04). Todo se ajusta por .env sin tocar código.
 */
return [
    // Cabecera con la IP REAL del visitante que pone el proxy de la plataforma y que
    // el cliente no puede falsificar (Render va detrás de Cloudflare: CF-Connecting-IP).
    // Vacío = comportamiento de Laravel (X-Forwarded-For). Verifícalo antes en
    // /superadmin → Seguridad (diagnóstico de IP).
    'client_ip_header' => env('CLIENT_IP_HEADER', ''),

    // Cabecera de país del proxy (Cloudflare: CF-IPCountry). Vacío = se consulta GeoIP.
    'country_header' => env('CLIENT_COUNTRY_HEADER', ''),

    // Países desde los que se puede usar el panel admin, el superadmin y el login.
    // Vacío = sin restricción. El chat y la web pública NO se restringen.
    'admin_paises' => array_values(array_filter(array_map(
        fn ($c) => strtoupper(trim($c)),
        explode(',', (string) env('ADMIN_ALLOWED_COUNTRIES', 'PE'))
    ))),

    // Intentos fallidos antes de bloquear (por IP) y minutos de bloqueo.
    'max_intentos'     => (int) env('LOGIN_MAX_INTENTOS', 5),
    'bloqueo_minutos'  => (int) env('LOGIN_BLOQUEO_MINUTOS', 15),
];
