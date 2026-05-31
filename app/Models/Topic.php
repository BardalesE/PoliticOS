<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Topic extends Model
{
    protected $fillable = [
        'name', 'label', 'emoji', 'keywords', 'color', 'sort_order', 'is_active',
    ];

    protected $casts = [
        'keywords'  => 'array',
        'is_active' => 'boolean',
    ];

    public static function activeKeywordsMap(): array
    {
        return static::where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->mapWithKeys(fn($t) => [$t->name => $t->keywords])
            ->all();
    }
}
