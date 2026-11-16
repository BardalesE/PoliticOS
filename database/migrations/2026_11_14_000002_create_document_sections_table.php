<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Un chunk (sección o trozo de sección) de un knowledge_document — ver
 * App\Services\DocumentChunker. `map_json`/`map_status` son el resultado del
 * MAP de Groq sobre ESTE chunk (idempotente: un chunk con map_status=listo no
 * se reprocesa). `embedding` es el vector de este chunk (Fase 1.7).
 *
 * Tabla de tenant — como todo lo del candidato, vive en la BD del tenant
 * (nunca en `central`). Toda consulta debe filtrar por candidate_id/document_id
 * (ver TenantContext y la regla de aislamiento en CLAUDE.md).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_sections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_id')->index();
            $table->unsignedBigInteger('candidate_id')->nullable()->index();
            $table->unsignedInteger('orden');
            $table->string('titulo', 255)->nullable();
            $table->longText('texto');
            $table->unsignedInteger('page_start');
            $table->unsignedInteger('page_end');
            $table->unsignedInteger('tokens')->default(0);
            $table->json('map_json')->nullable();
            $table->enum('map_status', ['pendiente', 'procesando', 'listo', 'error'])->default('pendiente')->index();
            $table->text('map_error')->nullable();
            $table->binary('embedding')->nullable();
            $table->timestamps();

            $table->unique(['document_id', 'orden']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_sections');
    }
};
