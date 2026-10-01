<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Último control de calidad del chat del candidato (ver ControlCalidadService). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidate_profiles', function (Blueprint $t) {
            if (! Schema::hasColumn('candidate_profiles', 'qa_estado')) {
                $t->string('qa_estado', 20)->nullable();      // aprobado | fallas | incompleto
            }
            if (! Schema::hasColumn('candidate_profiles', 'qa_at')) {
                $t->timestamp('qa_at')->nullable();
            }
            if (! Schema::hasColumn('candidate_profiles', 'qa_resumen')) {
                $t->json('qa_resumen')->nullable();          // [{id, titulo, estado, fallas:[...]}]
            }
        });
    }

    public function down(): void
    {
        Schema::table('candidate_profiles', function (Blueprint $t) {
            foreach (['qa_estado', 'qa_at', 'qa_resumen'] as $col) {
                if (Schema::hasColumn('candidate_profiles', $col)) {
                    $t->dropColumn($col);
                }
            }
        });
    }
};
