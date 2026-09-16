<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UbigeoDepartamento extends Model
{
    protected $fillable = ['departamento', 'ubigeo'];

    public function provincias()
    {
        return $this->hasMany(UbigeoProvincia::class, 'departamento_id');
    }
}
