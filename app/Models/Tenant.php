<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Tenant extends Model
{
    protected $connection = 'central';

    protected $fillable = [
        'slug', 'name', 'db_name', 'db_host', 'db_port',
        'db_user', 'db_password', 'plan', 'is_active',
        'custom_features',
        'admin_email', 'admin_password_hint', 'password_changed_at', 'credential_log',
        // ── Cuota de IA (feat/cuotas-ia) ──────────────────────────────────
        'mensajes_incluidos', 'mensajes_usados', 'periodo_inicio', 'estado_cuota',
    ];

    protected $hidden = ['db_password', 'admin_password_hint'];

    protected $appends = ['quota_used_percent'];

    protected $casts = [
        'is_active'          => 'boolean',
        'custom_features'    => 'array',
        'mensajes_incluidos' => 'integer',
        'mensajes_usados'    => 'integer',
        'periodo_inicio'     => 'date',
    ];

    protected static function booted(): void
    {
        // Los defaults a nivel de columna (mensajes_incluidos=1000,
        // mensajes_usados=0, estado_cuota='activo') los aplica MySQL en el
        // INSERT, pero Eloquent NO relee la fila tras create() — el modelo
        // en memoria se queda con esos atributos en null hasta el próximo
        // fresh()/refresh(). hasQuotaAvailable() justo después de crear un
        // tenant («estado_cuota === 'activo'» contra null) fallaba por esto.
        // Se setean acá explícito para que el objeto recién creado ya sea
        // consistente sin depender de un round-trip extra a la BD.
        static::creating(function (self $tenant) {
            if (is_null($tenant->periodo_inicio)) {
                $tenant->periodo_inicio = now()->toDateString();
            }
            if (is_null($tenant->mensajes_incluidos)) {
                $tenant->mensajes_incluidos = 1000;
            }
            if (is_null($tenant->mensajes_usados)) {
                $tenant->mensajes_usados = 0;
            }
            if (is_null($tenant->estado_cuota)) {
                $tenant->estado_cuota = 'activo';
            }
        });
    }

    public static function findBySlug(string $slug): ?self
    {
        return static::where('slug', $slug)->where('is_active', true)->first();
    }

    // ── Cuota de IA (feat/cuotas-ia) ───────────────────────────────────────

    public function getQuotaUsedPercentAttribute(): float
    {
        if (!$this->mensajes_incluidos) return 0.0;
        return round(min(100, ($this->mensajes_usados / $this->mensajes_incluidos) * 100), 1);
    }

    /** Usado por EnsureTenantQuota — bloquea si está suspendido o sin mensajes restantes. */
    public function hasQuotaAvailable(): bool
    {
        return $this->estado_cuota === 'activo' && $this->mensajes_usados < $this->mensajes_incluidos;
    }

    /**
     * Incrementa mensajes_usados — SOLO debe llamarse cuando la llamada al
     * LLM fue exitosa (ChatController lo condiciona a !ai_resting). Si el
     * incremento cruza el límite, marca estado_cuota='agotado' automático;
     * nunca toca 'suspendido' (eso es una acción manual del superadmin, no
     * algo que el conteo de mensajes deba revertir ni disparar).
     */
    public function recordSuccessfulMessage(): void
    {
        $this->increment('mensajes_usados');

        if ($this->estado_cuota === 'activo' && $this->mensajes_usados >= $this->mensajes_incluidos) {
            $this->update(['estado_cuota' => 'agotado']);
        }
    }
}
