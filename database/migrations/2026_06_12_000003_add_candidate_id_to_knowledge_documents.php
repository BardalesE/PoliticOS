<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 3 (y cimiento de la Fase 4 — atribución de fuente en RAG):
 * a qué candidato pertenece cada documento de conocimiento.
 *
 * Nullable a propósito: un documento sin candidate_id es material general
 * del tenant (normativa, datos del distrito, etc.). En modo PEPA, los
 * documentos atribuidos alimentan {{candidatos_con_docs}} del prompt.
 * Corre en la BD de cada tenant.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('knowledge_documents') || Schema::hasColumn('knowledge_documents', 'candidate_id')) {
            return;
        }

        Schema::table('knowledge_documents', function (Blueprint $table) {
            $table->foreignId('candidate_id')
                ->nullable()
                ->after('topic')
                ->constrained('candidate_profiles')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('knowledge_documents') || !Schema::hasColumn('knowledge_documents', 'candidate_id')) {
            return;
        }

        Schema::table('knowledge_documents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('candidate_id');
        });
    }
};
