<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 6: menciones canonicalizadas contra el diccionario JNE.
 * [{type: candidate|party|district, slug, name}] — a diferencia de `mentions`
 * (strings libres del LLM), permite agregar por rival/partido/región.
 * Nullable: las señales anteriores a la Fase 6 no lo tienen.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('external_signals', function (Blueprint $t) {
            $t->json('entities')->nullable()->after('mentions');
        });
    }

    public function down(): void
    {
        Schema::table('external_signals', function (Blueprint $t) {
            $t->dropColumn('entities');
        });
    }
};
