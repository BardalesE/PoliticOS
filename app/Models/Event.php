<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Event extends Model
{
    protected $fillable = [
        'title', 'description', 'event_date',
        'location', 'address', 'image_url', 'stream_url',
        'is_active', 'is_featured', 'sort_order',
    ];

    protected $casts = [
        'event_date' => 'datetime',
        'is_active'  => 'boolean',
        'is_featured'=> 'boolean',
        'sort_order' => 'integer',
    ];
}
