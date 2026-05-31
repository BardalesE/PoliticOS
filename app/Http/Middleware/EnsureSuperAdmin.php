<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $key = env('SUPER_ADMIN_KEY');

        if (!$key || $request->header('X-Super-Admin-Key') !== $key) {
            return response()->json(['message' => 'Acceso denegado.'], 403);
        }

        return $next($request);
    }
}
