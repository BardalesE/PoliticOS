<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContactVerification extends Model
{
    protected $fillable = [
        'channel', 'contact', 'visitor_uuid', 'code_hash', 'attempts',
        'ip', 'expires_at', 'verified_at', 'consumed_at',
    ];

    protected $hidden = ['code_hash'];

    protected $casts = [
        'attempts'    => 'integer',
        'expires_at'  => 'datetime',
        'verified_at' => 'datetime',
        'consumed_at' => 'datetime',
    ];
}
