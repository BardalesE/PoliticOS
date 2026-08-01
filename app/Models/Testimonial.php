<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Testimonial extends Model
{
    protected $fillable = [
        'name', 'role', 'photo_url', 'quote', 'district', 'sort_order', 'is_active',
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
