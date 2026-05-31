<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LiveStream extends Model
{
    protected $fillable = [
        'title', 'description', 'status', 'stream_key',
        'thumbnail', 'started_at', 'ended_at',
        'peak_viewers', 'current_viewers', 'chunk_count', 'scheduled_at',
    ];

    protected $casts = [
        'started_at'   => 'datetime',
        'ended_at'     => 'datetime',
        'scheduled_at' => 'datetime',
    ];
}
