<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Resultado del REDUCE jerárquico de un documento (uno por documento — ver
 * ReduceDocumentJob): índice, resumen ejecutivo, propuestas agrupadas por eje
 * y por región (ya normalizadas contra ubigeo). `version` sube cada vez que el
 * documento se reprocesa (reintento o reingesta manual).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_analysis', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_id')->unique();
            $table->json('indice_estructurado')->nullable();
            $table->longText('resumen_ejecutivo')->nullable();
            $table->json('propuestas_por_eje')->nullable();
            $table->json('propuestas_por_region')->nullable();
            $table->string('modelo', 100)->nullable();
            $table->unsignedInteger('tokens_usados')->default(0);
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_analysis');
    }
};
