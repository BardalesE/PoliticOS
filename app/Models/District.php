<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class District extends Model
{
    protected $fillable = ['name', 'keywords', 'sort_order', 'is_active'];

    protected $casts = [
        'keywords'  => 'array',
        'is_active' => 'boolean',
    ];

    public static function activeKeywordsMap(): array
    {
        return static::where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->mapWithKeys(fn($d) => [$d->name => $d->keywords])
            ->all();
    }
}
