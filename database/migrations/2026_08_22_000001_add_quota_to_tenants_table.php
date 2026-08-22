<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Control de cuota de IA por tenant (feat/cuotas-ia). Mismo patrón que las
 * migraciones previas de `tenants` (2026_06_02_*): Schema::table() plano, sin
 * connection() explícito — corre en la BD que resuelva el `migrate` normal,
 * que es la misma física que apunta la conexión 'central' (ver
 * config/database.php, comentario "never switched by ResolveTenant").
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->unsignedInteger('mensajes_incluidos')->default(1000)->after('custom_features');
            $table->unsignedInteger('mensajes_usados')->default(0)->after('mensajes_incluidos');
            $table->date('periodo_inicio')->nullable()->after('mensajes_usados');
            $table->enum('estado_cuota', ['activo', 'agotado', 'suspendido'])
                  ->default('activo')
                  ->after('periodo_inicio');
        });

        // Tenants ya existentes: sin esto periodo_inicio queda NULL y
        // tenant:reset-quota no puede calcular si ya venció su periodo.
        DB::table('tenants')->whereNull('periodo_inicio')->update([
            'periodo_inicio' => now()->toDateString(),
        ]);
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn(['mensajes_incluidos', 'mensajes_usados', 'periodo_inicio', 'estado_cuota']);
        });
    }
};
