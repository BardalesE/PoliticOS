<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/**
 * Calificacion de la plataforma (1-5 estrellas) + comentario libre.
 * Anonimo por diseno. Vive en la BD central: es feedback de producto, no de tenant.
 *
 *   POST /api/feedback          -> guarda una calificacion
 *   GET  /api/feedback/summary  -> promedio, total, 5★..1★ y ultimos 7 dias (publico, en vivo)
 *   GET  /api/feedback/publicos -> comentarios aprobados por el superadmin (publico)
 *   GET  /api/superadmin/feedback          -> listado completo con filtros
 *   PUT  /api/superadmin/feedback/{id}     -> publicar / ocultar el comentario
 *   DELETE /api/superadmin/feedback/{id}   -> borrar (spam, insultos)
 *
 * Los comentarios NUNCA salen al publico sin aprobacion: en campana cualquiera
 * puede escribir un insulto o propaganda, y la home los mostraria como nuestros.
 */
class PlatformFeedbackController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $v = Validator::make($request->all(), [
            'stars'           => ['required', 'integer', 'min:1', 'max:5'],
            'comment'         => ['nullable', 'string', 'max:500'],
            'context'         => ['nullable', 'string', 'in:chat,home'],
            'candidate_slug'  => ['nullable', 'string', 'max:80'],
            'tenant_slug'     => ['nullable', 'string', 'max:80'],
        ]);

        if ($v->fails()) {
            return response()->json(['message' => 'Datos invalidos.', 'errors' => $v->errors()], 422);
        }

        $data = $v->validated();

        DB::connection('central')->table('platform_feedback')->insert([
            'stars'          => $data['stars'],
            'comment'        => $data['comment'] ?? null,
            'context'        => $data['context'] ?? 'chat',
            'candidate_slug' => $data['candidate_slug'] ?? null,
            'tenant_slug'    => $data['tenant_slug'] ?? null,
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);

        $this->olvidarCache();

        return response()->json(['ok' => true], 201);
    }

    public function summary(): JsonResponse
    {
        // 10 s de cache: "en vivo" para la home sin golpear la BD en cada visita.
        $summary = Cache::remember('platform_feedback:summary', 10, fn () => $this->resumen());

        return response()->json($summary);
    }

    /** Comentarios aprobados para mostrar en la home (sin datos de quien los escribio). */
    public function publicos(): JsonResponse
    {
        $rows = Cache::remember('platform_feedback:publicos', 10, fn () => $this->tabla()
            ->where('publicado', true)
            ->whereNotNull('comment')
            ->orderByDesc('id')
            ->limit(12)
            ->get(['id', 'stars', 'comment', 'context', 'created_at'])
            ->map(fn ($r) => [
                'id' => (int) $r->id, 'stars' => (int) $r->stars, 'comment' => $r->comment,
                'context' => $r->context, 'created_at' => $r->created_at,
            ])->all());

        return response()->json(['data' => $rows]);
    }

    // ─── SuperAdmin ──────────────────────────────────────────────────

    public function adminIndex(Request $request): JsonResponse
    {
        $f = $request->validate([
            'stars'          => ['nullable', 'integer', 'min:1', 'max:5'],
            'con_comentario' => ['nullable', 'boolean'],
            'publicado'      => ['nullable', 'boolean'],
            'candidate_slug' => ['nullable', 'string', 'max:80'],
            'tenant_slug'    => ['nullable', 'string', 'max:80'],
            'page'           => ['nullable', 'integer', 'min:1'],
        ]);

        $q = $this->tabla()
            ->when(isset($f['stars']), fn ($q) => $q->where('stars', $f['stars']))
            ->when(! empty($f['con_comentario']), fn ($q) => $q->whereNotNull('comment')->where('comment', '!=', ''))
            ->when(isset($f['publicado']), fn ($q) => $q->where('publicado', (bool) $f['publicado']))
            ->when(! empty($f['candidate_slug']), fn ($q) => $q->where('candidate_slug', $f['candidate_slug']))
            ->when(! empty($f['tenant_slug']), fn ($q) => $q->where('tenant_slug', $f['tenant_slug']))
            ->orderByDesc('id');

        $page = $q->paginate(50, ['id', 'stars', 'comment', 'context', 'candidate_slug', 'tenant_slug', 'publicado', 'created_at']);

        return response()->json([
            'resumen'    => $this->resumen(),
            'data'       => collect($page->items())->map(fn ($r) => [
                'id' => (int) $r->id, 'stars' => (int) $r->stars, 'comment' => $r->comment, 'context' => $r->context,
                'candidate_slug' => $r->candidate_slug, 'tenant_slug' => $r->tenant_slug,
                'publicado' => (bool) $r->publicado, 'created_at' => $r->created_at,
            ])->all(),
            'total'      => $page->total(),
            'last_page'  => $page->lastPage(),
            'candidatos' => $this->tabla()->whereNotNull('candidate_slug')->distinct()->orderBy('candidate_slug')->pluck('candidate_slug')->all(),
        ]);
    }

    public function adminUpdate(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['publicado' => ['required', 'boolean']]);

        $row = $this->tabla()->where('id', $id)->first();
        if (! $row) {
            return response()->json(['message' => 'No existe.'], 404);
        }
        if ($data['publicado'] && trim((string) $row->comment) === '') {
            return response()->json(['message' => 'Solo se publican calificaciones con comentario.'], 422);
        }

        $this->tabla()->where('id', $id)->update(['publicado' => $data['publicado'], 'updated_at' => now()]);
        $this->olvidarCache();

        return response()->json(['ok' => true, 'publicado' => (bool) $data['publicado']]);
    }

    public function adminDestroy(int $id): JsonResponse
    {
        $deleted = $this->tabla()->where('id', $id)->delete();
        $this->olvidarCache();

        return response()->json(['deleted' => (bool) $deleted], $deleted ? 200 : 404);
    }

    // ─── Internos ────────────────────────────────────────────────────

    private function tabla()
    {
        return DB::connection('central')->table('platform_feedback');
    }

    /** @return array{total:int, average:float, distribucion:array<int,int>, ultimos_7_dias:int, con_comentario:int} */
    private function resumen(): array
    {
        $row = $this->tabla()
            ->selectRaw('COUNT(*) as total, COALESCE(AVG(stars), 0) as average')
            ->first();

        $dist = array_fill_keys([5, 4, 3, 2, 1], 0);
        foreach ($this->tabla()->selectRaw('stars, COUNT(*) as n')->groupBy('stars')->get() as $r) {
            $dist[(int) $r->stars] = (int) $r->n;
        }

        return [
            'total'          => (int) ($row->total ?? 0),
            'average'        => round((float) ($row->average ?? 0), 2),
            'distribucion'   => $dist,
            'ultimos_7_dias' => $this->tabla()->where('created_at', '>=', now()->subDays(7))->count(),
            'con_comentario' => $this->tabla()->whereNotNull('comment')->where('comment', '!=', '')->count(),
        ];
    }

    private function olvidarCache(): void
    {
        Cache::forget('platform_feedback:summary');
        Cache::forget('platform_feedback:publicos');
    }
}
