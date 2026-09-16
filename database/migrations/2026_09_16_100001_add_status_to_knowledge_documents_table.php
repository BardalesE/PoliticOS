<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * Pipeline de extracción async (subida → cola → procesamiento → estado listo).
 * Antes, store() extraía texto e indexaba embeddings de forma síncrona dentro
 * del request HTTP; ahora ProcessKnowledgeDocumentJob lo hace en background y
 * este status es la única señal de en qué punto va cada documento.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('knowledge_documents', function (Blueprint $table) {
            $table->enum('status', ['pending', 'processing', 'ready', 'failed'])
                ->default('pending')
                ->after('is_active');
            $table->text('error_message')->nullable()->after('status');
        });

        // Documentos ya existentes: si ya tienen contenido extraído, están
        // efectivamente "ready"; si no, "failed" (nunca se pudo extraer texto).
        DB::table('knowledge_documents')->whereNotNull('content')->where('content', '!=', '')
            ->update(['status' => 'ready']);
        DB::table('knowledge_documents')
            ->where(function ($q) { $q->whereNull('content')->orWhere('content', ''); })
            ->update(['status' => 'failed']);
    }

    public function down(): void
    {
        Schema::table('knowledge_documents', function (Blueprint $table) {
            $table->dropColumn(['status', 'error_message']);
        });
    }
};
