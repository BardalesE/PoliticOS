<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 3: modo de operación explícito del asistente.
 *
 *   - campaign: chatbot del candidato (politicos_v2_prompt) — tenants existentes
 *   - pepa:     asistente cívico neutral multi-candidato (pepa_prompt)
 *
 * Default 'campaign' para no cambiar el comportamiento de ningún tenant ya
 * provisionado; los tenants nuevos reciben 'pepa' explícito desde
 * TenantProvision. Corre en la BD de cada tenant.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('ai_settings') || Schema::hasColumn('ai_settings', 'mode')) {
            return;
        }

        Schema::table('ai_settings', function (Blueprint $table) {
            $table->enum('mode', ['campaign', 'pepa'])->default('campaign')->after('system_prompt');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('ai_settings') || !Schema::hasColumn('ai_settings', 'mode')) {
            return;
        }

        Schema::table('ai_settings', function (Blueprint $table) {
            $table->dropColumn('mode');
        });
    }
};
