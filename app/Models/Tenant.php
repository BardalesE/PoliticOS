<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Tenant extends Model
{
    protected $fillable = [
        'slug', 'name', 'db_name', 'db_host', 'db_port',
        'db_user', 'db_password', 'plan', 'is_active',
    ];

    protected $hidden = ['db_password'];

    protected $casts = ['is_active' => 'boolean'];

    public static function findBySlug(string $slug): ?self
    {
        return static::where('slug', $slug)->where('is_active', true)->first();
    }
}
