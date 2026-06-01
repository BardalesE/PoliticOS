<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KnowledgeDocument extends Model
{
    protected $fillable = [
        'title', 'description', 'file_url', 'original_name',
        'content', 'topic', 'file_size', 'is_active',
        'chunks', 'embeddings_meta', 'embeddings_indexed',
    ];

    protected $casts = [
        'is_active'          => 'boolean',
        'file_size'          => 'integer',
        'chunks'             => 'array',
        'embeddings_meta'    => 'array',
        'embeddings_indexed' => 'boolean',
    ];
}
