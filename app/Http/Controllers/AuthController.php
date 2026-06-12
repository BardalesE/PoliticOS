<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($request->only('email', 'password'))) {
            throw ValidationException::withMessages([
                'email' => ['Las credenciales no son correctas.'],
            ]);
        }

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
        $user = $request->user();
        return response()->json([
            'id'    => $user->id,
            'name'  => $user->name,
            'email' => $user->email,
            'role'  => $user->role,
        ]);
    }
}
