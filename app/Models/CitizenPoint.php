<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CitizenPoint extends Model
{
    protected $fillable = [
        'citizen_profile_id', 'action', 'points', 'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    public function citizen(): BelongsTo
    {
        return $this->belongsTo(CitizenProfile::class, 'citizen_profile_id');
    }
}
