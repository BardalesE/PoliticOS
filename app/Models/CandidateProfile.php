<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CandidateProfile extends Model
{
    protected $fillable = [
        'preset_name', 'is_active',
        // Directorio público (ver CLAUDE.md § "Arquitectura del directorio público")
        'slug', 'estado_publicacion', 'tipo_cuenta',
        'name', 'title', 'location', 'distrito_id', 'provincia_id', 'departamento_id', 'party', 'list_number',
        'bio', 'tagline', 'election_date',
        'photo_url', 'logo_url', 'hero_photo_url', 'hero_video_url',
        'color_primary', 'color_dark', 'color_accent',
        'tiktok_url', 'facebook_url', 'instagram_url', 'whatsapp_number',
        // v2 campos de personalidad para el system prompt dinámico
        'personality_traits', 'biography_long', 'signature_phrases',
        'forbidden_topics', 'priority_topics', 'target_segments',
        'campaign_slogan', 'attack_response_style',
        // Rediseño narrativo del sitio público — PÚBLICOS a propósito (no
        // van en $hidden), distintos de los campos de personalidad de
        // arriba que solo alimentan el chat.
        'bio_timeline', 'why_running', 'differentiator', 'testimonial_video_url',
    ];

    // Configuración interna del AI (system prompt): nunca debe salir en
    // ninguna respuesta JSON. CivicAIService la lee por atributo, así que
    // ocultarla de la serialización no afecta al chat.
    protected $hidden = [
        'personality_traits', 'biography_long', 'signature_phrases',
        'forbidden_topics', 'priority_topics', 'target_segments',
        'campaign_slogan', 'attack_response_style',
    ];

    protected $casts = [
        'is_active'          => 'boolean',
        'personality_traits' => 'array',
        'signature_phrases'  => 'array',
        'forbidden_topics'   => 'array',
        'priority_topics'    => 'array',
        'target_segments'    => 'array',
        'bio_timeline'       => 'array',
        'qa_resumen'         => 'array',
        'qa_at'              => 'datetime',
    ];

    /**
     * El distrito manda: si se asigna uno, provincia y departamento se copian de
     * él (así cualquier camino que solo setee distrito_id queda consistente).
     */
    protected static function booted(): void
    {
        static::saving(function (self $c) {
            // Un tenant sin la migración nueva no tiene estas columnas: no tocar nada.
            if (! self::tieneAmbito($c)) {
                return;
            }
            if ($c->distrito_id && ($c->isDirty('distrito_id') || ! $c->departamento_id)) {
                $d = UbigeoDistrito::query()->find($c->distrito_id, ['id', 'provincia_id', 'departamento_id']);
                if ($d) {
                    $c->provincia_id    = $d->provincia_id;
                    $c->departamento_id = $d->departamento_id;
                }
            }
        });
    }

    /** @var array<string, bool> columnas de ámbito por conexión (evita consultar el esquema en cada save) */
    private static array $ambitoPorConexion = [];

    private static function tieneAmbito(self $c): bool
    {
        $conn = $c->getConnectionName() ?? config('database.default');
        $key  = $conn . '|' . config("database.connections.{$conn}.database");   // tenants comparten nombre de conexión

        return self::$ambitoPorConexion[$key] ??= \Illuminate\Support\Facades\Schema::connection($c->getConnectionName())
            ->hasColumn($c->getTable(), 'departamento_id');
    }

    /** regional | provincial | distrital | null (sin ubicación) */
    public function getAmbitoAttribute(): ?string
    {
        return $this->distrito_id ? 'distrital'
            : ($this->provincia_id ? 'provincial'
            : ($this->departamento_id ? 'regional' : null));
    }

    public static function current(): ?self
    {
        return static::where('is_active', true)->first()
            ?? static::first();
    }

    public function distrito()
    {
        return $this->belongsTo(UbigeoDistrito::class, 'distrito_id');
    }

    public function departamento()
    {
        return $this->belongsTo(UbigeoDepartamento::class, 'departamento_id');
    }

    public function provincia()
    {
        return $this->belongsTo(UbigeoProvincia::class, 'provincia_id');
    }

    /** Documentos de la base de conocimiento de este candidato (Hoja de Vida, Plan de Gobierno…). */
    public function documents(): HasMany
    {
        return $this->hasMany(KnowledgeDocument::class, 'candidate_id');
    }

    /** Regidores de su lista, en el orden de la plancha. */
    public function regidores(): HasMany
    {
        return $this->hasMany(CandidatoRegidor::class, 'candidate_profile_id')->orderBy('orden')->orderBy('id');
    }

    /**
     * Regla ÚNICA de visibilidad del directorio público: un candidato (y por
     * tanto su distrito) solo se muestra si está publicado, tiene URL propia y
     * distrito, Y su base de conocimiento ya está lista (≥1 documento activo
     * procesado). Se calcula en cada consulta —no se guarda—, así que si se
     * borra su último documento el lugar deja de mostrarse solo.
     */
    /**
     * Candidatos del lugar elegido, SOLO de ese nivel (decisión 2026-10-03):
     *   distrito     → solo los distritales de ese distrito
     *   provincia    → solo los provinciales (alcaldía provincial)
     *   departamento → solo los regionales (gobierno regional)
     * Antes cada nivel arrastraba a los de arriba/abajo y el vecino veía 9
     * candidatos en San Gregorio cuando el distrito tiene 5. Única fuente de la
     * regla: la usan la home (/directorio) y el chat (segmentación).
     */
    public function scopeVotaEn(Builder $query, ?int $departamentoId, ?int $provinciaId = null, ?int $distritoId = null): Builder
    {
        if ($distritoId) {
            return $query->where('distrito_id', $distritoId);
        }

        if (! self::tieneAmbito($query->getModel())) {      // tenant sin migración de ámbito: solo hay distritales
            return $query->whereRaw('1 = 0');
        }

        if ($provinciaId) {
            return $query->whereNull('distrito_id')->where('provincia_id', $provinciaId);
        }

        return $departamentoId
            ? $query->whereNull('distrito_id')->whereNull('provincia_id')->where('departamento_id', $departamentoId)
            : $query;
    }

    public function scopeVisibleInDirectory(Builder $query): Builder
    {
        return $query
            ->where('estado_publicacion', 'publicado')
            ->whereNotNull('slug')
            // Ubicación mínima: el departamento (un candidato regional no tiene distrito).
            // Tenant aún sin la migración de ámbito: se sigue exigiendo distrito.
            ->whereNotNull(self::tieneAmbito($query->getModel()) ? 'departamento_id' : 'distrito_id')
            ->whereHas('documents', fn (Builder $d) => $d->where('is_active', true)->where('status', 'ready'));
    }
}
