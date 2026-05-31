<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IntelAlert extends Model
{
    protected $fillable = [
        'severity','type','title','description','payload',
        'source_table','source_id','acknowledged','acknowledged_at',
        'acknowledged_by','triggered_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'acknowledged' => 'boolean',
        'acknowledged_at' => 'datetime',
        'triggered_at' => 'datetime',
    ];

    public function scopeUnread($q)
    {
        return $q->where('acknowledged', false);
    }

    public function scopeBySeverity($q, string $severity)
    {
        return $q->where('severity', $severity);
    }
}
