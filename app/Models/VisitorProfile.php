<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VisitorProfile extends Model
{
    protected $fillable = [
        'visitor_uuid','inferred_age_range','inferred_district','inferred_segment',
        'inferred_intention','avg_sentiment','visits_count','total_messages',
        'total_duration_seconds','last_topics','detected_concerns',
        'consented','consented_at','first_seen_at','last_seen_at',
    ];

    protected $casts = [
        'last_topics' => 'array',
        'detected_concerns' => 'array',
        'consented' => 'boolean',
        'consented_at' => 'datetime',
        'first_seen_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'avg_sentiment' => 'float',
    ];

    public function sessions()
    {
        return $this->hasMany(ChatSession::class, 'visitor_uuid', 'visitor_uuid');
    }

    public function citizenData()
    {
        return $this->hasMany(CitizenData::class, 'visitor_uuid', 'visitor_uuid');
    }
}
