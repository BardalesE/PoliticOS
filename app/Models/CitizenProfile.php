<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class CitizenProfile extends Model
{
    protected $fillable = [
        'visitor_uuid', 'name', 'phone_whatsapp', 'email', 'dni',
        'district', 'age_range', 'occupation', 'voting_intention',
        'points_balance', 'referral_code', 'referred_by_code', 'source',
        'consented', 'consent_at', 'consent_ip',
        'is_verified', 'duplicate_score',
    ];

    protected $casts = [
        'consented'    => 'boolean',
        'is_verified'  => 'boolean',
        'consent_at'   => 'datetime',
    ];

    protected $hidden = ['dni'];

    public function points(): HasMany
    {
        return $this->hasMany(CitizenPoint::class);
    }

    // Genera un código de referido único de 8 chars
    public static function generateReferralCode(): string
    {
        do {
            $code = strtoupper(Str::random(8));
        } while (static::where('referral_code', $code)->exists());
        return $code;
    }

    // Añade puntos y registra la acción
    public function addPoints(string $action, int $points, array $metadata = []): void
    {
        CitizenPoint::create([
            'citizen_profile_id' => $this->id,
            'action'             => $action,
            'points'             => $points,
            'metadata'           => $metadata ?: null,
        ]);
        $this->increment('points_balance', $points);
    }

    // Puntos por acción
    public static function pointsFor(string $action): int
    {
        return match($action) {
            'registro'          => 50,
            'primer_mensaje'    => 10,
            'conversacion'      => 5,
            'referido_exitoso'  => 100,
            'perfil_completo'   => 20,
            'encuesta'          => 15,
            'compartir'         => 10,
            default             => 0,
        };
    }

    // Busca un perfil existente por contacto (anti-duplicados)
    public static function findByContact(
        ?string $phone = null,
        ?string $email = null,
        ?string $dni   = null
    ): ?self {
        if (!$phone && !$email && !$dni) return null;

        return static::where(function ($q) use ($phone, $email, $dni) {
            if ($phone) $q->orWhere('phone_whatsapp', $phone);
            if ($email) $q->orWhere('email',          $email);
            if ($dni)   $q->orWhere('dni',             $dni);
        })->first();
    }

    // Verifica si el perfil está completo (para dar puntos de perfil_completo)
    public function isProfileComplete(): bool
    {
        return !empty($this->name) && !empty($this->phone_whatsapp) && !empty($this->district);
    }
}
