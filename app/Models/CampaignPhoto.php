<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CampaignPhoto extends Model
{
    protected $fillable = ['url', 'title', 'category', 'size'];
}
