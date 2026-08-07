<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HeroMedia extends Model
{
    protected $fillable = ['url', 'type', 'sort_order'];

    protected $casts = [
        'sort_order' => 'integer',
    ];
}
