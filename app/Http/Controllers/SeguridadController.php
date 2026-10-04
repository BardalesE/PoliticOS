<?php

namespace App\Http\Controllers;

use App\Services\GeoIPService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Diagnóstico de IP y país (solo superadmin): muestra qué cabeceras pone el proxy
 * de producción para elegir bien CLIENT_IP_HEADER / CLIENT_COUNTRY_HEADER.
 */
class SeguridadController extends Controller
{
    public function diagnostico(Request $request, GeoIPService $geo): JsonResponse
    {
        $h = fn (string $n) => $request->headers->get($n);

        return response()->json([
            'ip_que_ve_laravel' => $request->ip(),
            'pais_geoip'        => rescue(fn () => $geo->resolve((string) $request->ip())['country'] ?? null, null, false),
            'cabeceras' => [
                'X-Forwarded-For'  => $h('X-Forwarded-For'),
                'X-Real-IP'        => $h('X-Real-IP'),
                'CF-Connecting-IP' => $h('CF-Connecting-IP'),
                'True-Client-IP'   => $h('True-Client-IP'),
                'CF-IPCountry'     => $h('CF-IPCountry'),
            ],
            'config' => [
                'CLIENT_IP_HEADER'        => config('seguridad.client_ip_header') ?: null,
                'CLIENT_COUNTRY_HEADER'   => config('seguridad.country_header') ?: null,
                'ADMIN_ALLOWED_COUNTRIES' => config('seguridad.admin_paises'),
                'LOGIN_MAX_INTENTOS'      => config('seguridad.max_intentos'),
                'LOGIN_BLOQUEO_MINUTOS'   => config('seguridad.bloqueo_minutos'),
            ],
        ]);
    }
}
