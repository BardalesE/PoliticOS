<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DocumentFaq extends Model
{
    protected $fillable = [
        'document_id', 'candidate_id', 'pregunta', 'respuesta', 'paginas', 'embedding',
    ];

    protected $casts = [
        'document_id'  => 'integer',
        'candidate_id' => 'integer',
        'paginas'      => 'array',
    ];

    public function document(): BelongsTo
    {
        return $this->belongsTo(KnowledgeDocument::class, 'document_id');
    }

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(CandidateProfile::class, 'candidate_id');
    }
}
