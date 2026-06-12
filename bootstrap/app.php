<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // CORS aplicado a todas las rutas (necesario para Next.js en puerto 3000)
        $middleware->prepend(\Illuminate\Http\Middleware\HandleCors::class);

        // ResolveTenant must run before auth:sanctum so the DB is switched before
        // Sanctum looks up the Bearer token. appendToGroup alone is insufficient:
        // SortedMiddleware reorders auth:sanctum (AuthenticatesRequests, priority 6)
        // ahead of anything not in the priority list. prependToPriorityList fixes that.
        $middleware->appendToGroup('api', \App\Http\Middleware\ResolveTenant::class);
        $middleware->appendToGroup('api', \App\Http\Middleware\SecurityHeaders::class);
        $middleware->prependToPriorityList(
            \Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests::class,
            \App\Http\Middleware\ResolveTenant::class
        );

        $middleware->alias([
            'admin'        => \App\Http\Middleware\EnsureIsAdmin::class,
            'tenant'       => \App\Http\Middleware\ResolveTenant::class,
            'superadmin'   => \App\Http\Middleware\EnsureSuperAdmin::class,
            'plan_feature' => \App\Http\Middleware\CheckPlanFeature::class,
            'ingest_key'   => \App\Http\Middleware\EnsureIngestKey::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->render(function (\Illuminate\Auth\AuthenticationException $e, $request) {
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }
        });
    })->create();
