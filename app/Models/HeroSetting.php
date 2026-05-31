<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HeroSetting extends Model
{
    protected $fillable = [
        'title', 'subtitle', 'badge_text',
        'video_url', 'image_url', 'overlay_opacity',
        'btn1_label', 'btn1_url',
        'btn2_label', 'btn2_url',
        'btn3_label', 'btn3_url',
        'is_active',
    ];

    protected $casts = [
        'overlay_opacity' => 'float',
        'is_active'       => 'boolean',
    ];
}
