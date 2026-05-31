<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SuggestedQuestion extends Model
{
    protected $fillable = ['question', 'topic', 'sort_order', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];
}
