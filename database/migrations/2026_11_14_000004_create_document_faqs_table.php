<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * FAQs generadas por el REDUCE (30-50 por documento, ver ReduceDocumentJob).
 * `paginas` nunca va vacío — una FAQ sin página de origen se descarta antes de
 * guardarse (regla de la Fase 1.6: toda FAQ conserva su cita verificable).
 * `embedding` habilita el match directo de la Fase 2.1(b) (similitud coseno
 * contra la pregunta del ciudadano, sin llamar al LLM si supera el umbral).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_faqs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_id')->index();
            $table->unsignedBigInteger('candidate_id')->nullable()->index();
            $table->text('pregunta');
            $table->longText('respuesta');
            $table->json('paginas');
            $table->binary('embedding')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_faqs');
    }
};
