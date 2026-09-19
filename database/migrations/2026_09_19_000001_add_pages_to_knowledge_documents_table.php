<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Texto del PDF separado por página (JSON: lista de strings, índice + 1 = número
 * de página del PDF). Permite que el RAG cite "pág. N" y que el ciudadano abra el
 * PDF en esa página para comprobar el texto. Los documentos anteriores quedan en
 * NULL y siguen funcionando sin página hasta correr knowledge:backfill-pages.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('knowledge_documents', function (Blueprint $table) {
            $table->longText('pages')->nullable()->after('content');
        });
    }

    public function down(): void
    {
        Schema::table('knowledge_documents', function (Blueprint $table) {
            $table->dropColumn('pages');
        });
    }
};
