<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Seguimiento fino del análisis profundo para el admin: cuánto lleva
 * corriendo, en qué etapa está (para poder estimar cuánto falta por el
 * ritmo real de secciones procesadas) y cuánto tardó en total al terminar.
 *
 * - analysis_started_at / analysis_finished_at: se setean al encolar
 *   (analyze()/retryAnalysis()) y al terminar (listo o error) — ver
 *   StartDocumentAnalysisJob, ProcessKnowledgeDocumentJob, ReduceDocumentJob,
 *   EmbedDocumentSectionsJob.
 * - analysis_stage: extrayendo → dividiendo → resumiendo_secciones →
 *   consolidando → generando_faqs → embeddings → listo. Se queda en la
 *   última etapa alcanzada si el análisis termina en error (para poder
 *   mostrar "falló en X").
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('knowledge_documents', function (Blueprint $table) {
            $table->timestamp('analysis_started_at')->nullable()->after('analyzed_at');
            $table->timestamp('analysis_finished_at')->nullable()->after('analysis_started_at');
            $table->string('analysis_stage', 30)->nullable()->after('analysis_finished_at');
        });
    }

    public function down(): void
    {
        Schema::table('knowledge_documents', function (Blueprint $table) {
            $table->dropColumn(['analysis_started_at', 'analysis_finished_at', 'analysis_stage']);
        });
    }
};
