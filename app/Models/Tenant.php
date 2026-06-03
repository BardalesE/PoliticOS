<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Tenant extends Model
{
    protected $connection = 'central';

    protected $fillable = [
        'slug', 'name', 'db_name', 'db_host', 'db_port',
        'db_user', 'db_password', 'plan', 'is_active',
        'custom_features',
        'admin_email', 'admin_password_hint', 'password_changed_at', 'credential_log',
    ];

    protected $hidden = ['db_password', 'admin_password_hint'];

    protected $casts = [
        'is_active'       => 'boolean',
        'custom_features' => 'array',
    ];

    public static function findBySlug(string $slug): ?self
    {
        return static::where('slug', $slug)->where('is_active', true)->first();
    }
}
