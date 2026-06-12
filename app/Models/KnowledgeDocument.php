<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KnowledgeDocument extends Model
{
    protected $fillable = [
        'title', 'description', 'file_url', 'original_name',
        'content', 'topic', 'candidate_id', 'source_url', 'source_type',
        'file_size', 'is_active',
        'chunks', 'embeddings_meta', 'embeddings_indexed',
    ];

    protected $casts = [
        'is_active'          => 'boolean',
        'candidate_id'       => 'integer',
        'file_size'          => 'integer',
        'chunks'             => 'array',
        'embeddings_meta'    => 'array',
        'embeddings_indexed' => 'boolean',
    ];

    /** Candidato al que pertenece el documento (null = material general del tenant). */
    public function candidate(): BelongsTo
    {
        return $this->belongsTo(CandidateProfile::class, 'candidate_id');
    }
}
