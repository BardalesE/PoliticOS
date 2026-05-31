<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KnowledgeDocument extends Model
{
    protected $fillable = [
        'title', 'description', 'file_url', 'original_name',
        'content', 'topic', 'file_size', 'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'file_size' => 'integer',
    ];
}
