<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Regidores de la lista de un candidato del directorio (la "plancha").
 * Su Hoja de Vida es un KnowledgeDocument normal del candidato (candidate_id
 * del alcalde, topic=hoja_de_vida), así PEPA la usa con las mismas reglas de
 * datos sensibles; aquí solo se guarda el vínculo.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('candidato_regidores')) {
            return;
        }

        Schema::create('candidato_regidores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('candidate_profile_id')->constrained('candidate_profiles')->cascadeOnDelete();
            $table->unsignedTinyInteger('orden')->default(1);
            $table->string('nombre', 150);
            $table->string('cargo', 60)->default('Regidor');
            $table->string('foto_url', 500)->nullable();
            $table->foreignId('knowledge_document_id')->nullable()->constrained('knowledge_documents')->nullOnDelete();
            $table->timestamps();

            $table->index(['candidate_profile_id', 'orden']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidato_regidores');
    }
};
