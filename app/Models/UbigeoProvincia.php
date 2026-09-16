<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UbigeoProvincia extends Model
{
    protected $fillable = ['provincia', 'ubigeo', 'departamento_id'];

    public function departamento()
    {
        return $this->belongsTo(UbigeoDepartamento::class, 'departamento_id');
    }

    public function distritos()
    {
        return $this->hasMany(UbigeoDistrito::class, 'provincia_id');
    }
}
