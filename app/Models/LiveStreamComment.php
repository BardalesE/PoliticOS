<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LiveStreamComment extends Model
{
    protected $fillable = ['live_stream_id', 'viewer_name', 'message'];

    public function stream(): BelongsTo
    {
        return $this->belongsTo(LiveStream::class, 'live_stream_id');
    }
}
