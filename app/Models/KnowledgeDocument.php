<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class KnowledgeDocument extends Model
{
    protected $fillable = [
        'title', 'description', 'file_url', 'original_name',
        'content', 'pages', 'topic', 'candidate_id', 'source_url', 'source_type',
        'file_size', 'is_active', 'status', 'error_message',
        'chunks', 'embeddings_meta', 'embeddings_indexed',
        'analysis_status', 'analysis_progress', 'analysis_error', 'analysis_batch_id',
        'analysis_stage', 'analysis_started_at', 'analysis_finished_at',
        'analyzed_at', 'is_public',
    ];

    protected $casts = [
        'is_active'            => 'boolean',
        'candidate_id'         => 'integer',
        'file_size'            => 'integer',
        'pages'                => 'array',
        'chunks'               => 'array',
        'embeddings_meta'      => 'array',
        'embeddings_indexed'   => 'boolean',
        'analysis_progress'    => 'integer',
        'analysis_started_at'  => 'datetime',
        'analysis_finished_at' => 'datetime',
        'analyzed_at'          => 'datetime',
        'is_public'            => 'boolean',
    ];

    /** Candidato al que pertenece el documento (null = material general del tenant). */
    public function candidate(): BelongsTo
    {
        return $this->belongsTo(CandidateProfile::class, 'candidate_id');
    }

    /** Chunks del pipeline MAP/REDUCE (App\Services\DocumentChunker), en orden. */
    public function sections(): HasMany
    {
        return $this->hasMany(DocumentSection::class, 'document_id')->orderBy('orden');
    }

    public function analysis(): HasOne
    {
        return $this->hasOne(DocumentAnalysis::class, 'document_id');
    }

    public function faqs(): HasMany
    {
        return $this->hasMany(DocumentFaq::class, 'document_id');
    }
}
