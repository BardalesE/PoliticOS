<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Zona que declara un visitante del chat (anónimo: solo su UUID de navegador). */
class VisitorSegment extends Model
{
    protected $fillable = ['visitor_uuid', 'departamento_id', 'provincia_id', 'distrito_id'];
}
