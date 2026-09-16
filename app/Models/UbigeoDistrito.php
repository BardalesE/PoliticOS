<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UbigeoDistrito extends Model
{
    protected $fillable = ['distrito', 'ubigeo', 'provincia_id', 'departamento_id'];

    public function provincia()
    {
        return $this->belongsTo(UbigeoProvincia::class, 'provincia_id');
    }

    public function departamento()
    {
        return $this->belongsTo(UbigeoDepartamento::class, 'departamento_id');
    }
}
