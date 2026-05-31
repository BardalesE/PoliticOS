<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChatMessage extends Model
{
    protected $fillable = [
        'session_id', 'role', 'content', 'topic', 'media',
        'sentiment', 'emotion', 'intent', 'concerns',
        'attack_detected', 'attack_category', 'analysis_raw',
        'pepa_metadata',
    ];

    protected $casts = [
        'concerns'       => 'array',
        'analysis_raw'   => 'array',
        'pepa_metadata'  => 'array',
        'attack_detected'=> 'boolean',
        'sentiment'      => 'float',
    ];

    public function session()
    {
        return $this->belongsTo(ChatSession::class, 'session_id');
    }
}
