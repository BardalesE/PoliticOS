<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fix seguridad post-QA (QA_COMPLETO.md, Fase 5/8): GROQ_API_KEY (y las de
 * Claude/OpenAI) se leen hoy vía env() global en config/services.php — una sola
 * clave compartida por TODOS los tenants del deployment. Este campo permite que
 * un tenant configure su propia key para el provider que tiene activo; si queda
 * null (el caso por defecto), CivicAIService sigue usando la key global como
 * fallback — no cambia el comportamiento de ningún tenant existente.
 *
 * Cifrado en reposo vía el cast 'encrypted' del modelo (AiSetting::$casts), no
 * en columna separada — se guarda como texto cifrado con APP_KEY.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('ai_settings') || Schema::hasColumn('ai_settings', 'api_key')) {
            return;
        }

        Schema::table('ai_settings', function (Blueprint $table) {
            $table->text('api_key')->nullable()->after('provider');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('ai_settings') || !Schema::hasColumn('ai_settings', 'api_key')) {
            return;
        }

        Schema::table('ai_settings', function (Blueprint $table) {
            $table->dropColumn('api_key');
        });
    }
};
