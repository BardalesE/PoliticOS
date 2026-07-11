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

        // Throttle por defecto para todo el grupo 'api' (QA_COMPLETO.md, Fase 9):
        // varias rutas públicas de contenido (candidate, proposals, gallery,
        // videos, team-members, events, hero-settings, home-settings,
        // campaign-videos, livestreams, knowledge) no tenían NINGÚN límite de
        // tasa. Rutas que ya declaran su propio throttle más estricto en
        // routes/api.php (login 5,1; citizen/register 5,1; chat* 30,1;
        // superadmin* 30,1) no se tocan y siguen siendo las que realmente
        // limitan esas rutas — este default de 60,1 solo se vuelve la barrera
        // operativa donde hoy no había ninguna.
        $middleware->appendToGroup('api', 'throttle:60,1');

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

        // ApplicationBuilder::withMiddleware() registra por defecto, de forma
        // incondicional, Authenticate::redirectUsing(fn () => route('login')) —
        // ANTES de que este callback corra. Esta app es 100% API y no tiene ninguna
        // ruta web llamada 'login', así que ese default hacía que cualquier guest
        // sin 'Accept: application/json' disparara RouteNotFoundException dentro del
        // propio cálculo de redirectTo() (antes de que AuthenticationException
        // llegara a construirse), lo cual se colaba sin pasar por el render()
        // personalizado de abajo y terminaba en la página de debug nativa de
        // Laravel con APP_DEBUG=true (fuga de stack trace en rutas públicas, ver
        // QA_COMPLETO.md Fase 9). Sobrescribimos ese default a "sin redirect".
        $middleware->redirectGuestsTo(fn () => null);

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

        // Renderer genérico para api/*: garantiza JSON limpio (sin file/line/trace)
        // para cualquier excepción que no tenga ya un renderer específico más arriba,
        // sin importar APP_DEBUG ni el header Accept. ValidationException y
        // HttpResponseException se dejan pasar (return null) porque Laravel ya les
        // da un manejo correcto por su cuenta (422 con `errors`, o la respuesta que
        // el propio código armó) — interceptarlas aquí las rompería.
        $exceptions->render(function (\Throwable $e, $request) {
            if (!$request->is('api/*')) {
                return null;
            }

            if ($e instanceof \Illuminate\Validation\ValidationException
                || $e instanceof \Illuminate\Http\Exceptions\HttpResponseException) {
                return null;
            }

            $isHttpException = $e instanceof \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
            $status  = $isHttpException ? $e->getStatusCode() : 500;
            // Los mensajes de excepciones HTTP "de forma" (404/405/429/403...) ya son
            // texto genérico y seguro ("Not Found.", "Too Many Attempts."). Un 500 sin
            // forma HTTP puede traer cualquier cosa en getMessage() (rutas, SQL, etc.)
            // así que ahí se sirve un mensaje fijo, nunca el mensaje real.
            $message = $isHttpException && $e->getMessage() !== ''
                ? $e->getMessage()
                : ($status === 500 ? 'Error interno del servidor.' : 'Error.');

            $response = response()->json(['message' => $message], $status);

            if ($isHttpException) {
                foreach ($e->getHeaders() as $name => $value) {
                    $response->headers->set($name, $value);
                }
            }

            return $response;
        });
    })->create();
