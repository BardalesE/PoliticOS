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
        'name', 'title', 'location', 'distrito_id', 'party', 'list_number',
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
    ];

    public static function current(): ?self
    {
        return static::where('is_active', true)->first()
            ?? static::first();
    }

    public function distrito()
    {
        return $this->belongsTo(UbigeoDistrito::class, 'distrito_id');
    }

    /** Documentos de la base de conocimiento de este candidato (Hoja de Vida, Plan de Gobierno…). */
    public function documents(): HasMany
    {
        return $this->hasMany(KnowledgeDocument::class, 'candidate_id');
    }

    /**
     * Regla ÚNICA de visibilidad del directorio público: un candidato (y por
     * tanto su distrito) solo se muestra si está publicado, tiene URL propia y
     * distrito, Y su base de conocimiento ya está lista (≥1 documento activo
     * procesado). Se calcula en cada consulta —no se guarda—, así que si se
     * borra su último documento el lugar deja de mostrarse solo.
     */
    public function scopeVisibleInDirectory(Builder $query): Builder
    {
        return $query
            ->where('estado_publicacion', 'publicado')
            ->whereNotNull('slug')
            ->whereNotNull('distrito_id')
            ->whereHas('documents', fn (Builder $d) => $d->where('is_active', true)->where('status', 'ready'));
    }
}
