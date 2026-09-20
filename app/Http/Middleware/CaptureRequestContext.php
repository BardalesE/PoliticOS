<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Symfony\Component\HttpFoundation\Response;

/**
 * Captura contexto del request (UTM, referrer, visitor cookie) y lo deja en attributes.
 * Aplicar en rutas públicas que captan datos: /api/chat
 */
class CaptureRequestContext
{
    public function handle(Request $request, Closure $next): Response
    {
        // Visitor cookie persistente (UUID v4)
        // El frontend (otro dominio que la API) no puede compartir la cookie de
        // sesión, así que manda su propio UUID estable (localStorage) en el body:
        // es el que sirve para topes por visitante. Prioridad: body > cookie > nuevo.
        $uuidRe = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';
        $fromClient  = (string) $request->input('visitor_id', '');
        $visitorUuid = preg_match($uuidRe, $fromClient) ? $fromClient : null;
        $usedClient  = $visitorUuid !== null;

        if (!$visitorUuid) {
            $visitorUuid = $request->cookie('politicos_visitor_id');
            if (!$visitorUuid || !preg_match($uuidRe, $visitorUuid)) {
                $visitorUuid = (string) \Illuminate\Support\Str::uuid();
            }
        }

        $context = [
            'visitor_uuid' => $visitorUuid,
            'visitor_from_client' => $usedClient,
            'referrer'     => $request->header('referer'),
            'utm_source'   => $request->query('utm_source'),
            'utm_medium'   => $request->query('utm_medium'),
            'utm_campaign' => $request->query('utm_campaign'),
            'consent_data_capture' => filter_var(
                $request->header('X-Consent-Data') ?? $request->cookie('politicos_consent'),
                FILTER_VALIDATE_BOOLEAN
            ),
        ];

        $request->attributes->set('request_context', $context);

        // Queue the cookie before calling next() so it works with StreamedResponse too
        Cookie::queue(
            'politicos_visitor_id',
            $visitorUuid,
            525600, // 1 año en minutos
            '/',
            null,
            $request->secure(),
            true, // httpOnly
            false,
            'lax'
        );

        $response = $next($request);

        return $response;
    }
}
