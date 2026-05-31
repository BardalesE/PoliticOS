<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ExternalSignal extends Model
{
    protected $fillable = [
        'source','source_url','source_name','author','title','content',
        'mentions','sentiment','emotion','topic','is_attack',
        'target_candidate','engagement','captured_at',
    ];

    protected $casts = [
        'mentions' => 'array',
        'is_attack' => 'boolean',
        'sentiment' => 'float',
        'captured_at' => 'datetime',
    ];
}
