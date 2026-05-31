<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Video extends Model
{
    protected $fillable = ['title', 'url', 'thumbnail', 'views', 'topic', 'published_at'];

    protected $casts = ['published_at' => 'datetime', 'views' => 'integer'];
}
