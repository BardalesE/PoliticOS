<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChatMessage extends Model
{
    /**
     * Candidato sobre el que consulta el request en curso (chips del chat). Lo fija
     * ChatController al inicio de cada request; los mensajes del usuario lo heredan
     * para poder contar consultas por candidato sin tocar cada punto de creación.
     */
    public static ?int $scopedCandidateId = null;

    protected static function booted(): void
    {
        static::creating(function (ChatMessage $m) {
            if ($m->role === 'user' && $m->candidate_profile_id === null && static::$scopedCandidateId !== null) {
                $m->candidate_profile_id = static::$scopedCandidateId;
            }
        });
    }

    protected $fillable = [
        'session_id', 'role', 'content', 'topic', 'media',
        'sentiment', 'emotion', 'intent', 'concerns',
        'attack_detected', 'attack_category', 'analysis_raw',
        'pepa_metadata', 'citations', 'is_fallback',
        'district_mentioned', 'proposals_detected', 'problems_mentioned',
        'candidate_profile_id',
    ];

    protected $casts = [
        'concerns'           => 'array',
        'analysis_raw'       => 'array',
        'pepa_metadata'      => 'array',
        'citations'          => 'array',
        'proposals_detected' => 'array',
        'problems_mentioned' => 'array',
        'attack_detected'    => 'boolean',
        'is_fallback'        => 'boolean',
        'sentiment'          => 'float',
    ];

    public function session()
    {
        return $this->belongsTo(ChatSession::class, 'session_id');
    }
}
