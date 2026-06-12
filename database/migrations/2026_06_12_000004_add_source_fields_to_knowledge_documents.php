<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 4: atribución de fuente en la base de conocimiento.
 *
 *   - source_url:  URL verificable que PEPA cita ([Candidato] — [Fuente: URL]).
 *                  Si el admin no da una externa, el controller usa la URL del
 *                  PDF subido — toda cita tiene siempre URL.
 *   - source_type: naturaleza del documento (pdf | interview | debate | news).
 *
 * Corre en la BD de cada tenant.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('knowledge_documents') || Schema::hasColumn('knowledge_documents', 'source_url')) {
            return;
        }

        Schema::table('knowledge_documents', function (Blueprint $table) {
            $table->string('source_url', 500)->nullable()->after('candidate_id');
            $table->enum('source_type', ['pdf', 'interview', 'debate', 'news'])
                ->default('pdf')
                ->after('source_url');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('knowledge_documents') || !Schema::hasColumn('knowledge_documents', 'source_url')) {
            return;
        }

        Schema::table('knowledge_documents', function (Blueprint $table) {
            $table->dropColumn(['source_url', 'source_type']);
        });
    }
};
