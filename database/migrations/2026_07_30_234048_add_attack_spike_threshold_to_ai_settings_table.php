<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('ai_settings', function (Blueprint $table) {
            // Umbral mínimo de ataques/hora para disparar la alerta
            // 'attack_spike' (IntelligenceService::generateAlerts). Antes
            // estaba fijo en 10 en el código — deuda ya documentada en
            // docs/architecture/02-separation-map.md. Default 10 = mismo
            // comportamiento que antes para tenants que no lo personalicen.
            $table->unsignedSmallInteger('attack_spike_threshold')->default(10)->after('max_tokens');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('ai_settings', function (Blueprint $table) {
            $table->dropColumn('attack_spike_threshold');
        });
    }
};
