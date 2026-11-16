<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Bug: la migración anterior (2026_11_16_000001) solo re-etiquetaba a
 * 'sin_analizar' los documentos que NO estaban en 'listo'/'no_aplica' — pero
 * una hoja de vida que ya se había analizado ANTES de que existiera el guard
 * de StartDocumentAnalysisJob (topic === 'hoja_de_vida' → 'no_aplica') quedó
 * en 'listo' o 'error', no en 'pendiente'/'procesando', así que esa
 * migración no la tocó. El admin seguía mostrándole el botón "Analizar
 * plan completo" y el estado de análisis a un documento que por regla de
 * negocio nunca debe analizarse.
 *
 * Esta migración es puramente de datos: fuerza 'no_aplica' en TODA hoja de
 * vida sin importar su analysis_status actual.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('knowledge_documents')
            ->where('topic', 'hoja_de_vida')
            ->where('analysis_status', '!=', 'no_aplica')
            ->update([
                'analysis_status'   => 'no_aplica',
                'analysis_progress' => 0,
                'analysis_error'    => null,
                'analysis_batch_id' => null,
            ]);
    }

    public function down(): void
    {
        // Migración de datos, no de schema: no hay un "estado anterior" útil
        // al que volver (habría que saber el analysis_status previo de cada
        // fila, que no se guardó). No-op a propósito.
    }
};
