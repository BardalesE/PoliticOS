<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Solicitud ARCO / reclamo de un ciudadano (Ley 29733). Global: siempre en la BD
 * central — la atiende el superadmin, venga del tenant que venga.
 */
class PrivacyRequest extends Model
{
    protected $connection = 'central';

    protected $table = 'privacy_requests';

    public const TYPES    = ['acceso', 'rectificacion', 'cancelacion', 'oposicion', 'reclamo'];
    public const STATUSES = ['recibida', 'en_proceso', 'atendida', 'rechazada'];

    /**
     * Plazo máximo de respuesta en días hábiles según el reglamento de la Ley 29733
     * (acceso 20; rectificación, cancelación y oposición 10). Reclamos: el plazo
     * corto, por prudencia. Validar con asesoría legal si el reglamento cambia.
     */
    public const DUE_BUSINESS_DAYS = [
        'acceso'        => 20,
        'rectificacion' => 10,
        'cancelacion'   => 10,
        'oposicion'     => 10,
        'reclamo'       => 10,
    ];

    protected $fillable = [
        'code', 'tenant_slug', 'type', 'status', 'visitor_uuid', 'name', 'email', 'phone',
        'description', 'erased_automatically', 'erased_counts', 'due_at', 'resolved_at',
        'resolution_note', 'ip_hash',
    ];

    protected $casts = [
        'erased_automatically' => 'boolean',
        'erased_counts'        => 'array',
        'due_at'               => 'date',
        'resolved_at'          => 'datetime',
    ];

    public static function newCode(): string
    {
        do {
            $code = 'ARCO-' . Str::upper(Str::random(8));
        } while (static::where('code', $code)->exists());

        return $code;
    }

    /** Suma días hábiles (lunes a viernes). No descuenta feriados: el superadmin ve el plazo con margen. */
    public static function addBusinessDays(CarbonInterface $from, int $days): Carbon
    {
        $d = Carbon::instance($from)->startOfDay();
        while ($days > 0) {
            $d->addDay();
            if (! $d->isWeekend()) {
                $days--;
            }
        }

        return $d;
    }

    public static function dueDateFor(string $type, ?CarbonInterface $from = null): Carbon
    {
        return static::addBusinessDays($from ?? now(), self::DUE_BUSINESS_DAYS[$type] ?? 10);
    }
}
