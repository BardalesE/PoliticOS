<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * El análisis profundo deja de arrancar solo (al subir/reindexar un PDF): se
 * dispara únicamente con el botón "Analizar plan completo" del admin. Para
 * eso:
 *
 * - 'sin_analizar': nuevo estado inicial/default, reemplaza a 'pendiente'
 *   como punto de partida (pendiente sigue existiendo, ahora significa
 *   "encolado, esperando a que el worker arranque" tras pulsar el botón).
 * - 'no_aplica' (ya en uso desde código — StartDocumentAnalysisJob — pero
 *   nunca se amplió el ENUM de la BD): hojas de vida, que nunca se analizan.
 * - analysis_batch_id: id del Bus::batch en curso, para poder cancelarlo
 *   (botón "Cancelar") y borrar sus jobs pendientes de la cola.
 * - analyzed_at: fecha del último análisis completo con éxito, para el
 *   "Listo (con fecha)" del admin — updated_at no sirve, cambia con
 *   cualquier edición del documento (título, is_active, etc).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            "ALTER TABLE knowledge_documents MODIFY analysis_status " .
            "ENUM('sin_analizar','pendiente','procesando','listo','error','no_aplica') " .
            "NOT NULL DEFAULT 'sin_analizar'"
        );

        Schema::table('knowledge_documents', function (Blueprint $table) {
            $table->string('analysis_batch_id')->nullable()->after('analysis_error');
            $table->timestamp('analyzed_at')->nullable()->after('analysis_batch_id');
        });

        // Documentos existentes que no llegaron a 'listo' (ni son 'no_aplica'):
        // con el análisis ya no auto-arrancando, un 'pendiente'/'procesando'/
        // 'error' huérfano (de un batch que esta migración no está corriendo)
        // debe volver a 'sin_analizar' para que el admin muestre el botón
        // "Analizar", no "En cola"/"Analizando" de un proceso que ya no existe.
        DB::table('knowledge_documents')
            ->whereNotIn('analysis_status', ['listo', 'no_aplica'])
            ->update([
                'analysis_status'   => 'sin_analizar',
                'analysis_progress' => 0,
                'analysis_error'    => null,
            ]);
    }

    public function down(): void
    {
        Schema::table('knowledge_documents', function (Blueprint $table) {
            $table->dropColumn(['analysis_batch_id', 'analyzed_at']);
        });

        DB::table('knowledge_documents')
            ->whereNotIn('analysis_status', ['listo', 'error'])
            ->update(['analysis_status' => 'pendiente']);

        DB::statement(
            "ALTER TABLE knowledge_documents MODIFY analysis_status " .
            "ENUM('pendiente','procesando','listo','error') NOT NULL DEFAULT 'pendiente'"
        );
    }
};
