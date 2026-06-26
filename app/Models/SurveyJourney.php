<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SurveyJourney extends Model
{
    protected $fillable = [
        'client_uuid', 'place', 'district', 'province', 'surveyed_on', 'created_by',
    ];

    protected $casts = [
        'surveyed_on' => 'date',
    ];

    public function responses(): HasMany
    {
        return $this->hasMany(SurveyResponse::class);
    }

    // Etiqueta legible, ej: "San Gregorio - 26/06/2026"
    public function getLabelAttribute(): string
    {
        return trim($this->place) . ' - ' . optional($this->surveyed_on)->format('d/m/Y');
    }
}
