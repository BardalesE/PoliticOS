<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DocumentAnalysis extends Model
{
    protected $fillable = [
        'document_id', 'indice_estructurado', 'resumen_ejecutivo',
        'propuestas_por_eje', 'propuestas_por_region',
        'modelo', 'tokens_usados', 'version',
    ];

    protected $casts = [
        'document_id'            => 'integer',
        'indice_estructurado'     => 'array',
        'propuestas_por_eje'      => 'array',
        'propuestas_por_region'   => 'array',
        'tokens_usados'           => 'integer',
        'version'                 => 'integer',
    ];

    public function document(): BelongsTo
    {
        return $this->belongsTo(KnowledgeDocument::class, 'document_id');
    }
}
