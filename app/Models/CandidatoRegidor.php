<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Regidor de la lista de un candidato del directorio. */
class CandidatoRegidor extends Model
{
    protected $table = 'candidato_regidores';

    protected $fillable = ['candidate_profile_id', 'orden', 'nombre', 'cargo', 'foto_url', 'knowledge_document_id'];

    protected $casts = ['orden' => 'integer'];

    public function candidato(): BelongsTo
    {
        return $this->belongsTo(CandidateProfile::class, 'candidate_profile_id');
    }

    public function hojaDeVida(): BelongsTo
    {
        return $this->belongsTo(KnowledgeDocument::class, 'knowledge_document_id');
    }
}
