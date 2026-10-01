<?php

namespace App\Http\Controllers;

use App\Models\CandidateProfile;
use App\Models\CandidatoRegidor;
use App\Models\KnowledgeDocument;
use App\Models\UbigeoDepartamento;
use App\Models\UbigeoDistrito;
use App\Models\UbigeoProvincia;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Alta manual de candidatos del directorio (panel admin del tenant "directorio").
 *
 *   GET    /api/admin/directorio/candidatos
 *   POST   /api/admin/directorio/candidatos
 *   PUT    /api/admin/directorio/candidatos/{id}
 *   POST   /api/admin/directorio/candidatos/{id}/publicar
 *   POST   /api/admin/directorio/candidatos/{id}/despublicar
 *   DELETE /api/admin/directorio/candidatos/{id}
 *   POST   /api/admin/directorio/foto            → sube una foto o el símbolo del partido desde el dispositivo, devuelve { url }
 *
 * Los PDF (Hoja de Vida, Plan de Gobierno) NO se suben aquí: se reutiliza
 * POST /api/admin/knowledge con `candidate_id`, que ya extrae e indexa.
 *
 * Nunca toca is_active: los candidatos del directorio no deben volverse "el
 * candidato activo" del tenant (eso rige el chat/branding de los tenants pagos).
 */
class DirectorioAdminController extends Controller
{
    private const DOC_COLUMNS = [
        'id', 'candidate_id', 'title', 'topic', 'status', 'error_message', 'file_url', 'file_size', 'is_active', 'created_at',
    ];

    /**
     * Foto del candidato subida desde el dispositivo. Devuelve la URL pública
     * (disco de media: R2 en producción) para guardarla en photo_url.
     */
    public function uploadFoto(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'max:5120'], // 5 MB
        ], [
            'file.mimes' => 'La foto debe ser JPG, PNG o WEBP.',
            'file.max'   => 'La foto pesa más de 5 MB.',
        ]);

        $disk = config('filesystems.media');
        $path = $request->file('file')->store('candidatos', $disk);

        return response()->json(['url' => Storage::disk($disk)->url($path)], 201);
    }

    public function index(): JsonResponse
    {
        $ready = fn (Builder $d) => $d->where('is_active', true)->where('status', 'ready');

        $rows = CandidateProfile::query()
            ->with([
                'distrito.provincia:id,provincia', 'distrito.departamento:id,departamento',
                'departamento:id,departamento', 'provincia:id,provincia',
                // Documentos para la tabla del admin (sin `content`: el texto del RAG pesa).
                'documents' => fn ($d) => $d->select(self::DOC_COLUMNS)->orderBy('created_at'),
            ])
            ->withCount([
                'documents as documentos_total',
                'documents as documentos_listos' => $ready,
                'documents as documentos_procesando' => fn (Builder $d) => $d->whereIn('status', ['pending', 'processing']),
                'documents as documentos_fallidos'   => fn (Builder $d) => $d->where('status', 'failed'),
            ])
            ->get();

        $this->cargarRegidores($rows);

        $rows = $rows
            ->map(fn (CandidateProfile $c) => $this->fila($c))
            // Departamento › provincia › distrito › nombre. Sin distrito, al final.
            // Regionales primero en su departamento, luego provinciales, luego distritales.
            ->sortBy(fn (array $r) => [
                $r['departamento'] ? 0 : 1,
                mb_strtolower((string) $r['departamento']),
                mb_strtolower((string) $r['provincia']),
                mb_strtolower((string) $r['distrito']),
                mb_strtolower($r['name']),
            ])
            ->values();

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request): JsonResponse
    {
        $data  = $this->validated($request, creating: true);
        $lugar = $this->resolverLugar($data);
        if (! $lugar) {
            return response()->json(['message' => 'Elige al menos el departamento.', 'errors' => ['departamento_id' => ['Elige al menos el departamento.']]], 422);
        }

        $profile = CandidateProfile::create(array_merge($data, $lugar['ids'], [
            'location'           => $lugar['location'],
            'slug'               => $this->uniqueSlug($data['name'], $lugar['slug']),
            'estado_publicacion' => 'borrador',
            'tipo_cuenta'        => 'publico_gratuito',
            'is_active'          => false,
        ]));

        return response()->json($this->fila($this->recargar($profile)), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $profile = CandidateProfile::findOrFail($id);
        $data    = $this->validated($request, creating: false);

        $tocaLugar = array_key_exists('distrito_id', $data) || array_key_exists('provincia_id', $data) || array_key_exists('departamento_id', $data);
        if ($tocaLugar && ($lugar = $this->resolverLugar($data))) {
            $data = array_merge($data, $lugar['ids'], ['location' => $lugar['location']]);
            // La URL pública es estable: solo se crea si el perfil aún no tiene.
            if (! $profile->slug) {
                $data['slug'] = $this->uniqueSlug($data['name'] ?? $profile->name, $lugar['slug']);
            }
        }

        $profile->update($data);

        return response()->json($this->fila($this->recargar($profile)));
    }

    public function publicar(int $id): JsonResponse
    {
        $profile = CandidateProfile::findOrFail($id);

        $faltan = [];
        if (! $profile->departamento_id && ! $profile->distrito_id) {
            $faltan[] = 'una ubicación (al menos el departamento)';
        }
        if (! $profile->slug) {
            $faltan[] = 'una URL pública (asígnale ubicación)';
        }
        $listos = $profile->documents()->where('is_active', true)->where('status', 'ready')->count();
        if ($listos === 0) {
            $faltan[] = 'al menos un documento procesado (Hoja de Vida o Plan de Gobierno)';
        }

        if ($faltan) {
            return response()->json([
                'message' => 'Para publicar falta: ' . implode(', ', $faltan) . '.',
                'faltan'  => $faltan,
            ], 422);
        }

        $profile->update(['estado_publicacion' => 'publicado']);

        return response()->json($this->fila($this->recargar($profile)));
    }

    public function despublicar(int $id): JsonResponse
    {
        $profile = CandidateProfile::findOrFail($id);
        $profile->update(['estado_publicacion' => 'borrador']);

        return response()->json($this->fila($this->recargar($profile)));
    }

    public function destroy(int $id): JsonResponse
    {
        $profile = CandidateProfile::findOrFail($id);

        // Un candidato activo es el que rige el chat/branding de un tenant
        // pago: no se borra desde el directorio.
        if ($profile->is_active) {
            return response()->json([
                'message' => 'Este candidato está activo en el tenant (chat y marca). No se puede eliminar desde el directorio.',
            ], 422);
        }

        // Sus documentos quedan huérfanos (candidate_id → null) en vez de
        // borrarse: se pueden reasignar y no se pierde el RAG ya indexado.
        $profile->documents()->update(['candidate_id' => null]);
        $profile->delete();

        return response()->json(['deleted' => true]);
    }

    // ─── Regidores de la lista ─────────────────────────────────────────

    /**
     * POST /admin/directorio/candidatos/{id}/regidores
     * Uno ({nombre, orden?}) o varios a la vez ({nombres: ["…", "…"]}): la
     * plancha se suele copiar entera del JNE.
     */
    public function storeRegidores(Request $request, int $id): JsonResponse
    {
        $profile = CandidateProfile::findOrFail($id);
        $data = $request->validate([
            'nombre'    => ['required_without:nombres', 'string', 'max:150'],
            'orden'     => ['nullable', 'integer', 'min:1', 'max:99'],
            'cargo'     => ['nullable', 'string', 'max:60'],
            'nombres'   => ['required_without:nombre', 'array', 'max:30'],
            'nombres.*' => ['nullable', 'string', 'max:150'],   // líneas vacías del pegado: se ignoran
        ]);

        $nombres = collect($data['nombres'] ?? [$data['nombre']])
            ->map(fn ($n) => trim(preg_replace('/\s+/u', ' ', (string) $n)))
            ->filter()
            ->values();

        if ($nombres->isEmpty()) {
            return response()->json(['message' => 'Escribe al menos un nombre.', 'errors' => ['nombres' => ['Escribe al menos un nombre.']]], 422);
        }

        $siguiente = (int) $profile->regidores()->max('orden') + 1;
        foreach ($nombres as $i => $nombre) {
            $profile->regidores()->create([
                'nombre' => $nombre,
                'orden'  => $nombres->count() === 1 && ! empty($data['orden']) ? $data['orden'] : $siguiente + $i,
                'cargo'  => $data['cargo'] ?? 'Regidor',
            ]);
        }

        return response()->json($this->fila($this->recargar($profile)), 201);
    }

    /** PUT /admin/directorio/regidores/{id} — nombre, orden, cargo, foto o su Hoja de Vida. */
    public function updateRegidor(Request $request, int $id): JsonResponse
    {
        $regidor = CandidatoRegidor::findOrFail($id);
        $data = $request->validate([
            'nombre'                => ['sometimes', 'string', 'max:150'],
            'orden'                 => ['sometimes', 'integer', 'min:1', 'max:99'],
            'cargo'                 => ['sometimes', 'string', 'max:60'],
            'foto_url'              => ['nullable', 'url', 'max:500'],
            'knowledge_document_id' => ['nullable', 'integer'],
        ]);

        // La Hoja de Vida tiene que ser un documento del MISMO candidato: si no,
        // su contenido no entraría en el chat acotado a esta lista.
        if (! empty($data['knowledge_document_id'])) {
            $pertenece = KnowledgeDocument::whereKey($data['knowledge_document_id'])
                ->where('candidate_id', $regidor->candidate_profile_id)
                ->exists();
            if (! $pertenece) {
                return response()->json(['message' => 'Ese documento no pertenece a este candidato.'], 422);
            }
        }

        $regidor->update($data);

        return response()->json($this->fila($this->recargar($regidor->candidato)));
    }

    /** DELETE /admin/directorio/regidores/{id} — también retira su Hoja de Vida del chat. */
    public function destroyRegidor(int $id): JsonResponse
    {
        $regidor  = CandidatoRegidor::findOrFail($id);
        $profile  = $regidor->candidato;

        if ($regidor->knowledge_document_id) {
            // Desactivar (no borrar): deja de citarse y de verse, y se puede recuperar.
            KnowledgeDocument::whereKey($regidor->knowledge_document_id)->update(['is_active' => false]);
        }
        $regidor->delete();

        return response()->json($this->fila($this->recargar($profile)));
    }

    private function recargar(CandidateProfile $c): CandidateProfile
    {
        $c = $c->fresh()->load('distrito.provincia', 'distrito.departamento', 'departamento:id,departamento', 'provincia:id,provincia');
        $this->cargarRegidores(new \Illuminate\Database\Eloquent\Collection([$c]));

        return $c;
    }

    /**
     * Carga los regidores de todas las filas. Si el tenant aún no corrió la
     * migración de candidato_regidores, el directorio sigue funcionando sin ellos.
     */
    private function cargarRegidores($rows): void
    {
        try {
            $rows->load('regidores');
        } catch (\Throwable) {
            $rows->each(fn (CandidateProfile $c) => $c->setRelation('regidores', collect()));
        }
    }

    private function regidoresDe(CandidateProfile $c): array
    {
        try {
            return $c->regidores->map(fn (CandidatoRegidor $r) => $this->regidorFila($r))->values()->all();
        } catch (\Throwable) {
            return [];
        }
    }

    private function regidorFila(CandidatoRegidor $r): array
    {
        return [
            'id'                    => $r->id,
            'orden'                 => $r->orden,
            'nombre'                => $r->nombre,
            'cargo'                 => $r->cargo,
            'foto_url'              => $r->foto_url,
            'knowledge_document_id' => $r->knowledge_document_id,
        ];
    }

    private function validated(Request $request, bool $creating): array
    {
        $req = $creating ? 'required' : 'sometimes';

        return $request->validate([
            'name'          => [$req, 'string', 'max:150'],
            'title'         => [$req, 'string', 'max:200'],   // cargo: "Candidato a Alcalde…"
            'party'         => [$req, 'string', 'max:100'],
            // Ubicación según el cargo: basta el departamento (regional), o
            // departamento+provincia (provincial), o el distrito (distrital).
            'departamento_id' => ['nullable', 'integer', 'exists:ubigeo_departamentos,id'],
            'provincia_id'    => ['nullable', 'integer', 'exists:ubigeo_provincias,id'],
            'distrito_id'     => [$creating ? 'required_without_all:departamento_id,provincia_id' : 'sometimes', 'nullable', 'integer', 'exists:ubigeo_distritos,id'],
            'list_number'   => ['nullable', 'string', 'max:10'],
            'bio'           => ['nullable', 'string', 'max:5000'],
            'tagline'       => ['nullable', 'string', 'max:300'],
            'photo_url'     => ['nullable', 'url', 'max:500'],
            'logo_url'      => ['nullable', 'url', 'max:500'],   // símbolo del partido / organización
            'tiktok_url'    => ['nullable', 'url', 'max:500'],
            'facebook_url'  => ['nullable', 'url', 'max:500'],
            'instagram_url' => ['nullable', 'url', 'max:500'],
            // Cliente que completó su perfil (foto, bio, documentos de campaña).
            // Solo cambia el distintivo público: la IA usa las mismas reglas para todos.
            'tipo_cuenta'   => ['sometimes', 'in:publico_gratuito,cliente_pago'],
        ]);
    }

    /**
     * Ubicación más específica enviada → ids coherentes de los tres niveles,
     * texto de ubicación y nombre para el slug. null si no llegó ninguna.
     *
     * @return array{ids: array{departamento_id:int|null, provincia_id:int|null, distrito_id:int|null}, location: string, slug: string}|null
     */
    private function resolverLugar(array $data): ?array
    {
        if (! empty($data['distrito_id'])) {
            $d = UbigeoDistrito::with(['provincia', 'departamento'])->findOrFail($data['distrito_id']);
            return [
                'ids'      => ['departamento_id' => $d->departamento_id, 'provincia_id' => $d->provincia_id, 'distrito_id' => $d->id],
                'location' => $this->unir([$d->distrito, $d->provincia->provincia, $d->departamento->departamento]),
                'slug'     => $d->distrito,
            ];
        }
        if (! empty($data['provincia_id'])) {
            $p = UbigeoProvincia::with('departamento')->findOrFail($data['provincia_id']);
            return [
                'ids'      => ['departamento_id' => $p->departamento_id, 'provincia_id' => $p->id, 'distrito_id' => null],
                'location' => $this->unir([$p->provincia, $p->departamento->departamento]),
                'slug'     => $p->provincia,
            ];
        }
        if (! empty($data['departamento_id'])) {
            $dep = UbigeoDepartamento::findOrFail($data['departamento_id']);
            return [
                'ids'      => ['departamento_id' => $dep->id, 'provincia_id' => null, 'distrito_id' => null],
                'location' => $this->unir([$dep->departamento]),
                'slug'     => $dep->departamento,
            ];
        }

        return null;
    }

    private function unir(array $nombres): string
    {
        return implode(', ', array_map($this->pretty(...), $nombres));
    }

    /** El INEI entrega los nombres en MAYÚSCULAS: "SAN SILVESTRE DE COCHAN" → "San Silvestre de Cochan". */
    private function pretty(string $name): string
    {
        $small = ['de', 'del', 'la', 'las', 'los', 'el', 'y'];
        $words = preg_split('/\s+/', mb_strtolower(trim($name))) ?: [];

        return implode(' ', array_map(
            fn (string $w, int $i) => ($i > 0 && in_array($w, $small, true)) ? $w : mb_convert_case($w, MB_CASE_TITLE),
            $words,
            array_keys($words),
        ));
    }

    /** Slug único: "juan-perez-san-gregorio", "-2", "-3"… */
    private function uniqueSlug(string $name, string $lugar): string
    {
        $base = Str::slug("{$name} {$lugar}");
        $slug = $base;
        $i    = 2;

        while (CandidateProfile::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$i}";
            $i++;
        }

        return $slug;
    }

    /** Fila del listado admin, con el estado de "listo para publicar". */
    private function fila(CandidateProfile $c): array
    {
        $listos     = $c->documentos_listos ?? $c->documents()->where('is_active', true)->where('status', 'ready')->count();
        $total      = $c->documentos_total ?? $c->documents()->count();
        $procesando = $c->documentos_procesando ?? $c->documents()->whereIn('status', ['pending', 'processing'])->count();
        $fallidos   = $c->documentos_fallidos ?? $c->documents()->where('status', 'failed')->count();

        return [
            'id'                 => $c->id,
            'qa_estado'          => $c->qa_estado ?? null,
            'qa_at'              => $c->qa_at?->toIso8601String(),
            'name'               => $c->name,
            'title'              => $c->title,
            'party'              => $c->party,
            'list_number'        => $c->list_number,
            'slug'               => $c->slug,
            'photo_url'          => $c->photo_url,
            'logo_url'           => $c->logo_url,
            'bio'                => $c->bio,
            'tagline'            => $c->tagline,
            'tiktok_url'         => $c->tiktok_url,
            'facebook_url'       => $c->facebook_url,
            'instagram_url'      => $c->instagram_url,
            'location'           => $c->location,
            'distrito_id'        => $c->distrito_id,
            'departamento_id'    => $c->departamento_id ?? $c->distrito?->departamento_id,
            'provincia_id'       => $c->provincia_id ?? $c->distrito?->provincia_id,
            'departamento'       => $c->departamento?->departamento ?? $c->distrito?->departamento?->departamento,
            'provincia'          => $c->provincia?->provincia ?? $c->distrito?->provincia?->provincia,
            'distrito'           => $c->distrito?->distrito,
            'ambito'             => $c->ambito,
            'regidores'          => $this->regidoresDe($c),
            'documentos'         => ($c->relationLoaded('documents') ? $c->documents : $c->documents()->select(self::DOC_COLUMNS)->orderBy('created_at')->get())
                ->map(fn ($d) => [
                    'id'            => $d->id,
                    'title'         => $d->title,
                    'topic'         => $d->topic,
                    'status'        => $d->status,
                    'error_message' => $d->error_message,
                    'file_url'      => $d->file_url,
                    'file_size'     => $d->file_size ? (int) $d->file_size : null,
                    'is_active'     => (bool) $d->is_active,
                ])->values()->all(),
            'estado_publicacion' => $c->estado_publicacion,
            'tipo_cuenta'        => $c->tipo_cuenta,
            'is_active'          => (bool) $c->is_active,
            'documentos_total'   => (int) $total,
            'documentos_listos'  => (int) $listos,
            'documentos_procesando' => (int) $procesando,
            'documentos_fallidos'   => (int) $fallidos,
            // Visible al público = publicado + slug + distrito + ≥1 documento listo
            'visible'            => $c->estado_publicacion === 'publicado' && $c->slug && ($c->departamento_id || $c->distrito_id) && $listos > 0,
        ];
    }

    // ─── Control de calidad del chat (ver ControlCalidadService) ──────────

    /** Casos que se le harán al chat de este candidato + el último resultado guardado. */
    public function qaCasos(int $id, \App\Services\ControlCalidadService $qa): JsonResponse
    {
        $c = CandidateProfile::findOrFail($id);

        return response()->json([
            'casos'  => $qa->casos($c),
            'ultimo' => [
                'estado'  => $c->qa_estado ?? null,
                'at'      => $c->qa_at?->toIso8601String(),
                'resumen' => $c->qa_resumen ?? [],
            ],
        ]);
    }

    /** Ejecuta UN caso (el panel los recorre de a uno: cada caso tarda unos segundos). */
    public function qaEjecutar(int $id, string $caso, \App\Services\ControlCalidadService $qa): JsonResponse
    {
        $c = CandidateProfile::findOrFail($id);
        @set_time_limit(120);

        try {
            return response()->json($qa->ejecutar($c, $caso));
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 404);
        } catch (\Throwable $e) {
            // Endpoint solo de admin: se muestra la causa para poder corregirla.
            \Illuminate\Support\Facades\Log::error('Control de calidad falló', ['caso' => $caso, 'candidato' => $id, 'error' => $e->getMessage()]);

            return response()->json(['message' => 'El caso falló en el servidor: ' . mb_substr($e->getMessage(), 0, 300)], 500);
        }
    }

    /** Guarda el resultado de una corrida completa: aprobado solo si TODOS los casos salieron ok. */
    public function qaGuardar(Request $request, int $id): JsonResponse
    {
        $c = CandidateProfile::findOrFail($id);
        $data = $request->validate([
            'resultados'            => ['required', 'array', 'min:1', 'max:60'],
            'resultados.*.id'       => ['required', 'string', 'max:40'],
            'resultados.*.titulo'   => ['required', 'string', 'max:120'],
            'resultados.*.estado'   => ['required', 'in:ok,falla,sin_respuesta'],
            'resultados.*.fallas'   => ['nullable', 'array', 'max:20'],
            'resultados.*.fallas.*' => ['string', 'max:300'],
        ]);

        $estados = collect($data['resultados'])->pluck('estado');
        $estado  = $estados->contains('falla') ? 'fallas' : ($estados->contains('sin_respuesta') ? 'incompleto' : 'aprobado');

        $c->forceFill(['qa_estado' => $estado, 'qa_at' => now(), 'qa_resumen' => $data['resultados']])->save();

        return response()->json(['estado' => $estado, 'at' => $c->qa_at->toIso8601String()]);
    }
}
