<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Un visitante único (IP hasheada) de la plataforma. Global: siempre en la BD
 * central, nunca en la de un tenant.
 */
class SiteVisitor extends Model
{
    protected $connection = 'central';

    protected $table = 'site_visitors';

    public $timestamps = false;

    protected $fillable = ['ip_hash', 'first_seen_at'];
}
