<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidate_profiles', function (Blueprint $table) {
            // Nullable: no hay forma confiable de mapear el `location` de texto
            // libre existente a un distrito INEI específico, y las filas ya
            // sembradas (ver TenantProvision) no traen distrito. `location`
            // se mantiene tal cual — sigue alimentando {{location}} en el
            // system prompt (CivicAIService::711); distrito_id es la
            // referencia estructurada nueva para el dropdown en cascada.
            $table->foreignId('distrito_id')->nullable()->after('location')
                ->constrained('ubigeo_distritos')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('candidate_profiles', function (Blueprint $table) {
            $table->dropConstrainedForeignId('distrito_id');
        });
    }
};
