<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CampaignVideo extends Model
{
    protected $fillable = ['url', 'thumbnail', 'title', 'category', 'size'];
}
