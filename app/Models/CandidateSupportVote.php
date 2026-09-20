<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Voto "¿apoyas a este candidato? sí/no" de un visitante. Anónimo, uno por
 * visitante y candidato. NO es una encuesta científica: nunca se publica.
 */
class CandidateSupportVote extends Model
{
    protected $fillable = [
        'candidate_profile_id', 'visitor_uuid', 'supports',
        'departamento_id', 'provincia_id', 'distrito_id',
    ];

    protected $casts = ['supports' => 'boolean'];
}
