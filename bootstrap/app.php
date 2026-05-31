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

        $middleware->alias([
            'admin'       => \App\Http\Middleware\EnsureIsAdmin::class,
            'tenant'      => \App\Http\Middleware\ResolveTenant::class,
            'superadmin'  => \App\Http\Middleware\EnsureSuperAdmin::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
