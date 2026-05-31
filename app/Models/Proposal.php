<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Proposal extends Model
{
    protected $fillable = [
        'title', 'description', 'district', 'topic',
        'budget', 'priority', 'status', 'image', 'document_url',
    ];

    protected $casts = [
        'budget'   => 'decimal:2',
        'priority' => 'integer',
    ];
}
