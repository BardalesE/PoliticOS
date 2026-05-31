<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ChatSession extends Model
{
    protected $fillable = [
        'session_id', 'ip', 'user_agent', 'started_at',
        'visitor_uuid', 'geo_country', 'geo_region', 'geo_city', 'geo_lat', 'geo_lng',
        'device_type', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign',
        'duration_seconds', 'messages_count', 'nonsense_count', 'blocked_at',
        'inferred_segment', 'inferred_intention',
        'avg_sentiment', 'consent_data_capture', 'consent_at',
        'postura_inicial', 'postura_actual', 'cambio_de_opinion',
    ];

    protected $casts = [
        'started_at'           => 'datetime',
        'consent_at'           => 'datetime',
        'blocked_at'           => 'datetime',
        'consent_data_capture' => 'boolean',
        'avg_sentiment'        => 'float',
    ];

    public function messages(): HasMany
    {
        return $this->hasMany(ChatMessage::class, 'session_id', 'id');
    }
}
