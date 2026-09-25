<?php

namespace App\Http\Controllers;

use App\Models\CandidateProfile;
use App\Models\UbigeoDistrito;
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
            ->with(['distrito.provincia:id,provincia', 'distrito.departamento:id,departamento'])
            ->withCount([
                'documents as documentos_total',
                'documents as documentos_listos' => $ready,
                'documents as documentos_procesando' => fn (Builder $d) => $d->whereIn('status', ['pending', 'processing']),
                'documents as documentos_fallidos'   => fn (Builder $d) => $d->where('status', 'failed'),
            ])
            ->orderByDesc('id')
            ->get()
            ->map(fn (CandidateProfile $c) => $this->fila($c));

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request, creating: true);
        $distrito = UbigeoDistrito::with(['provincia', 'departamento'])->findOrFail($data['distrito_id']);

        $profile = CandidateProfile::create($data + [
            'location'           => $this->ubicacion($distrito),
            'slug'               => $this->uniqueSlug($data['name'], $distrito),
            'estado_publicacion' => 'borrador',
            'tipo_cuenta'        => 'publico_gratuito',
            'is_active'          => false,
        ]);

        return response()->json($this->fila($profile->load('distrito.provincia', 'distrito.departamento')), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $profile = CandidateProfile::findOrFail($id);
        $data    = $this->validated($request, creating: false);

        if (isset($data['distrito_id'])) {
            $distrito = UbigeoDistrito::with(['provincia', 'departamento'])->findOrFail($data['distrito_id']);
            $data['location'] = $this->ubicacion($distrito);
            // Un perfil existente sin URL (p. ej. candidato de un tenant que se
            // reutiliza como directorio) obtiene su slug al asignarle distrito.
            // Si ya tiene, NO se cambia: la URL pública debe ser estable.
            if (! $profile->slug) {
                $data['slug'] = $this->uniqueSlug($data['name'] ?? $profile->name, $distrito);
            }
        }

        $profile->update($data);

        return response()->json($this->fila($profile->fresh()->load('distrito.provincia', 'distrito.departamento')));
    }

    public function publicar(int $id): JsonResponse
    {
        $profile = CandidateProfile::findOrFail($id);

        $faltan = [];
        if (! $profile->distrito_id) {
            $faltan[] = 'un distrito';
        }
        if (! $profile->slug) {
            $faltan[] = 'una URL pública (asígnale distrito)';
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

        return response()->json($this->fila($profile->fresh()->load('distrito.provincia', 'distrito.departamento')));
    }

    public function despublicar(int $id): JsonResponse
    {
        $profile = CandidateProfile::findOrFail($id);
        $profile->update(['estado_publicacion' => 'borrador']);

        return response()->json($this->fila($profile->fresh()->load('distrito.provincia', 'distrito.departamento')));
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

    private function validated(Request $request, bool $creating): array
    {
        $req = $creating ? 'required' : 'sometimes';

        return $request->validate([
            'name'          => [$req, 'string', 'max:150'],
            'title'         => [$req, 'string', 'max:200'],   // cargo: "Candidato a Alcalde…"
            'party'         => [$req, 'string', 'max:100'],
            'distrito_id'   => [$req, 'integer', 'exists:ubigeo_distritos,id'],
            'list_number'   => ['nullable', 'string', 'max:10'],
            'bio'           => ['nullable', 'string', 'max:5000'],
            'tagline'       => ['nullable', 'string', 'max:300'],
            'photo_url'     => ['nullable', 'url', 'max:500'],
            'logo_url'      => ['nullable', 'url', 'max:500'],   // símbolo del partido / organización
            'tiktok_url'    => ['nullable', 'url', 'max:500'],
            'facebook_url'  => ['nullable', 'url', 'max:500'],
            'instagram_url' => ['nullable', 'url', 'max:500'],
        ]);
    }

    private function ubicacion(UbigeoDistrito $d): string
    {
        return implode(', ', array_map($this->pretty(...), [
            $d->distrito, $d->provincia->provincia, $d->departamento->departamento,
        ]));
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
    private function uniqueSlug(string $name, UbigeoDistrito $distrito): string
    {
        $base = Str::slug("{$name} {$distrito->distrito}");
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
            'departamento_id'    => $c->distrito?->departamento_id,
            'provincia_id'       => $c->distrito?->provincia_id,
            'estado_publicacion' => $c->estado_publicacion,
            'tipo_cuenta'        => $c->tipo_cuenta,
            'is_active'          => (bool) $c->is_active,
            'documentos_total'   => (int) $total,
            'documentos_listos'  => (int) $listos,
            'documentos_procesando' => (int) $procesando,
            'documentos_fallidos'   => (int) $fallidos,
            // Visible al público = publicado + slug + distrito + ≥1 documento listo
            'visible'            => $c->estado_publicacion === 'publicado' && $c->slug && $c->distrito_id && $listos > 0,
        ];
    }
}
