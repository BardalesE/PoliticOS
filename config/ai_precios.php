<?php

/*
| Precios de REFERENCIA por millón de tokens (USD) para el panel "Consumo de IA".
| Cambian: revísalos en la página de precios de cada proveedor y edítalos aquí.
| Clave: "proveedor:prefijo-del-modelo" (gana el prefijo más largo que coincida).
| in = entrada, out = salida, cache_read / cache_write = prompt caching (Claude).
*/
return [
    'modelos' => [
        'groq:openai/gpt-oss-120b'   => ['in' => 0.15,  'out' => 0.60],
        'groq:openai/gpt-oss-20b'    => ['in' => 0.075, 'out' => 0.30],
        'groq:'                      => ['in' => 0.15,  'out' => 0.60],
        'claude:claude-haiku'        => ['in' => 1.00,  'out' => 5.00,  'cache_read' => 0.10, 'cache_write' => 1.25],
        'claude:claude-sonnet'       => ['in' => 3.00,  'out' => 15.00, 'cache_read' => 0.30, 'cache_write' => 3.75],
        'claude:claude-opus'         => ['in' => 15.00, 'out' => 75.00, 'cache_read' => 1.50, 'cache_write' => 18.75],
        'claude:'                    => ['in' => 1.00,  'out' => 5.00,  'cache_read' => 0.10, 'cache_write' => 1.25],
        'openai:gpt-4o-mini'         => ['in' => 0.15,  'out' => 0.60],
        'openai:gemini'              => ['in' => 0.10,  'out' => 0.40],
        'openai:'                    => ['in' => 0.15,  'out' => 0.60],
    ],

    // Proveedores usados en plan GRATIS: el panel muestra su costo como "equivalente",
    // no como gasto real. Ej. AI_PLANES_GRATIS=groq,openai
    'gratis' => array_filter(array_map('trim', explode(',', (string) env('AI_PLANES_GRATIS', 'groq')))),

    // Tope de tokens por día del plan gratis de Groq, solo para la barra del panel
    // (revísalo en console.groq.com → Settings → Limits). 0 = no mostrar barra.
    'groq_tokens_dia' => (int) env('GROQ_TOKENS_DIA', 0),
];
