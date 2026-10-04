<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Con trustProxies('*') Laravel toma la IP de X-Forwarded-For, que el cliente puede
 * inventar: un atacante cambia de "IP" en cada request y esquiva topes y bloqueos.
 * Si se configura CLIENT_IP_HEADER (p. ej. CF-Connecting-IP, que Cloudflare
 * sobrescribe siempre), esa es la IP del visitante y se ignora X-Forwarded-For.
 */
class RealClientIp
{
    public function handle(Request $request, Closure $next): Response
    {
        $header = (string) config('seguridad.client_ip_header');
        if ($header !== '') {
            $ip = trim(explode(',', (string) $request->headers->get($header, ''))[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                $request->server->set('REMOTE_ADDR', $ip);
                $request->headers->remove('X-Forwarded-For');
                $request->headers->remove('X-Real-IP');
            }
        }

        return $next($request);
    }
}
