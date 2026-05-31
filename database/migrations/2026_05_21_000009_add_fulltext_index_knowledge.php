<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * Agrega FULLTEXT index a knowledge_documents.content para mejorar el RAG sin Qdrant.
 * Mejora 10x vs LIKE '%word%'. Cuando Hector levante Qdrant, se hace swap del driver.
 * También agrega chunks pre-procesados para evitar reextracción.
 */
return new class extends Migration {
    public function up(): void
    {
        // Asegurar que la tabla use InnoDB con FULLTEXT (MySQL 5.6+)
        Schema::table('knowledge_documents', function (Blueprint $t) {
            $t->json('chunks')->nullable()->after('content'); // chunks pre-procesados con metadata
            $t->json('embeddings_meta')->nullable();          // {provider, model, vector_ids[]}
            $t->boolean('embeddings_indexed')->default(false);
        });

        // FULLTEXT index requiere InnoDB y MySQL 5.6+
        try {
            DB::statement('ALTER TABLE knowledge_documents ADD FULLTEXT idx_content_ft (title, content)');
        } catch (\Throwable $e) {
            // SQLite o entorno que no soporta FULLTEXT: continuamos sin él
            \Log::warning('FULLTEXT index not created: '.$e->getMessage());
        }
    }

    public function down(): void
    {
        try {
            DB::statement('ALTER TABLE knowledge_documents DROP INDEX idx_content_ft');
        } catch (\Throwable $e) {}

        Schema::table('knowledge_documents', function (Blueprint $t) {
            $t->dropColumn(['chunks','embeddings_meta','embeddings_indexed']);
        });
    }
};
