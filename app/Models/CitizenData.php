<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CitizenData extends Model
{
    protected $table = 'citizen_data';

    protected $fillable = [
        'session_id','visitor_uuid','field_name','field_value','confidence','source',
    ];

    protected $casts = [
        'confidence' => 'float',
    ];

    public function session()
    {
        return $this->belongsTo(ChatSession::class, 'session_id');
    }
}
