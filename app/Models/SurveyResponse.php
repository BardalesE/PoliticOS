<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SurveyResponse extends Model
{
    protected $fillable = [
        'client_uuid', 'survey_journey_id', 'vote_intention', 'knew_proposal',
        'consented', 'consent_ip',
        'name', 'phone', 'dni', 'age', 'sex',
        'captured_at', 'created_by',
    ];

    protected $casts = [
        'knew_proposal' => 'boolean',
        'consented'     => 'boolean',
        'age'           => 'integer',
        'captured_at'   => 'datetime',
    ];

    // El DNI no viaja en respuestas JSON (mismo criterio que CitizenProfile)
    protected $hidden = ['dni'];

    public function journey(): BelongsTo
    {
        return $this->belongsTo(SurveyJourney::class, 'survey_journey_id');
    }
}
