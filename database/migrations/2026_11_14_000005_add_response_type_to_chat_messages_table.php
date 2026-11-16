<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Qué produjo esta respuesta (Fase 2.5, analítica del panel): 'menu' (resumen
 * + índice sin LLM), 'faq' (coincidencia de FAQ por coseno, sin LLM), 'rag'
 * (fragmentos de document_sections — Fase 1 — con o sin LLM según el modo).
 * null = el candidato no tenía documentos con análisis profundo listo, o el
 * mensaje no llegó a CivicAIService::respond()/respondStream() (bienvenida,
 * bloqueo, nonsense, etc.) — comportamiento de antes de la Fase 2.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->enum('response_type', ['menu', 'faq', 'rag'])->nullable()->after('citations');
        });
    }

    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->dropColumn('response_type');
        });
    }
};
