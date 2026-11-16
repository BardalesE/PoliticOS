<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Estado del pipeline de ingesta completa (MAP+REDUCE+embeddings), separado del
 * `status` existente (que solo cubre extracción de texto + indexado FULLTEXT,
 * rápido y síncrono-por-defecto). `analysis_status` puede tardar minutos y
 * corre en cola — ver ProcessKnowledgeDocumentJob / Bus::batch.
 *
 * `is_public` solo se marca true cuando MAP+REDUCE+embeddings terminaron: es
 * el gate que usará la Fase 2 (RAG sobre document_sections) para no servir un
 * documento a medio analizar.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('knowledge_documents', function (Blueprint $table) {
            $table->enum('analysis_status', ['pendiente', 'procesando', 'listo', 'error'])
                ->default('pendiente')
                ->after('error_message');
            $table->unsignedTinyInteger('analysis_progress')->default(0)->after('analysis_status');
            $table->text('analysis_error')->nullable()->after('analysis_progress');
            $table->boolean('is_public')->default(false)->after('analysis_error');
        });
    }

    public function down(): void
    {
        Schema::table('knowledge_documents', function (Blueprint $table) {
            $table->dropColumn(['analysis_status', 'analysis_progress', 'analysis_error', 'is_public']);
        });
    }
};
