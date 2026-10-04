<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        // Bloqueo por fuerza bruta: N fallos por IP o por correo → espera (config/seguridad.php).
        $max     = max(1, (int) config('seguridad.max_intentos', 5));
        $segs    = 60 * max(1, (int) config('seguridad.bloqueo_minutos', 15));
        $porIp   = 'login-ip:' . $request->ip();
        $porMail = 'login-mail:' . sha1(mb_strtolower(trim((string) $request->input('email'))));

        if (RateLimiter::tooManyAttempts($porIp, $max) || RateLimiter::tooManyAttempts($porMail, $max)) {
            $espera = max(RateLimiter::availableIn($porIp), RateLimiter::availableIn($porMail));

            return response()->json([
                'message'     => 'Demasiados intentos fallidos. Intenta de nuevo en ' . max(1, (int) ceil($espera / 60)) . ' minutos.',
                'retry_after' => $espera,
            ], 429);
        }

        if (! Auth::attempt($request->only('email', 'password'))) {
            RateLimiter::hit($porIp, $segs);
            RateLimiter::hit($porMail, $segs);
            Log::warning('seguridad: login fallido', ['ip' => $request->ip()]);

            throw ValidationException::withMessages([
                'email' => ['Las credenciales no son correctas.'],
            ]);
        }

        RateLimiter::clear($porIp);
        RateLimiter::clear($porMail);

        /** @var User $user */
        $user = Auth::user();

        // Solo 'admin' puede iniciar sesión en el panel. El rol 'editor' existe
        // en la BD pero queda reservado para v3 (permisos granulares) — por eso
        // el UI de usuarios tampoco lo ofrece al crear cuentas.
        if (! $user->isAdmin()) {
            Auth::logout();
            return response()->json(['message' => 'Acceso no autorizado.'], 403);
        }

        $token = $user->createToken('admin-panel')->plainTextToken;

        $tenant = app()->bound('tenant') ? app('tenant') : null;

        return response()->json([
            'token'       => $token,
            'tenant_slug' => $tenant?->slug,
            'tenant_name' => $tenant?->name,
            'user'        => [
                'id'    => $user->id,
                'name'  => $user->name,
                'email' => $user->email,
                'role'  => $user->role,
            ],
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Sesión cerrada.']);
    }

    public function me(Request $request): JsonResponse
    {
        $user   = $request->user();
        $tenant = app()->bound('tenant') ? app('tenant') : null;

        return response()->json([
            'id'    => $user->id,
            'name'  => $user->name,
            'email' => $user->email,
            'role'  => $user->role,
            // A qué candidato (tenant) está hablando ESTA sesión, según el
            // servidor: el panel lo muestra siempre para que nadie edite otro
            // candidato sin darse cuenta. null = instalación single-tenant.
            'tenant' => $tenant ? ['slug' => $tenant->slug, 'name' => $tenant->name] : null,
        ]);
    }
}
