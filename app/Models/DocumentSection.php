<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DocumentSection extends Model
{
    protected $fillable = [
        'document_id', 'candidate_id', 'orden', 'titulo', 'texto',
        'page_start', 'page_end', 'tokens',
        'map_json', 'map_status', 'map_error', 'embedding',
    ];

    protected $casts = [
        'document_id' => 'integer',
        'candidate_id' => 'integer',
        'orden'       => 'integer',
        'page_start'  => 'integer',
        'page_end'    => 'integer',
        'tokens'      => 'integer',
        'map_json'    => 'array',
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
