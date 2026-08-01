<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Achievement extends Model
{
    protected $fillable = [
        'title', 'description', 'metric_label', 'metric_value',
        'photo_before_url', 'photo_after_url', 'district',
        'status', 'sort_order', 'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public static function activePublic()
    {
        return static::where('is_active', true)
            ->orderBy('sort_order')
            ->get();
    }
}
