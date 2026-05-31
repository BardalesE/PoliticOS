<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Campos de seguimiento del prompt Pepa (asistente cívico).
 *
 * chat_sessions: postura_inicial, postura_actual, cambio_de_opinion.
 * chat_messages: pepa_metadata (JSON con metadata_interna del output estructurado).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('chat_sessions', function (Blueprint $t) {
            $t->string('postura_inicial', 140)->nullable()->after('inferred_intention');
            $t->string('postura_actual', 140)->nullable()->after('postura_inicial');
            $t->enum('cambio_de_opinion', ['si', 'no', 'aun_no_evaluable'])->nullable()->after('postura_actual');
        });

        Schema::table('chat_messages', function (Blueprint $t) {
            $t->json('pepa_metadata')->nullable()->after('analysis_raw');
        });
    }

    public function down(): void
    {
        Schema::table('chat_sessions', function (Blueprint $t) {
            $t->dropColumn(['postura_inicial', 'postura_actual', 'cambio_de_opinion']);
        });

        Schema::table('chat_messages', function (Blueprint $t) {
            $t->dropColumn('pepa_metadata');
        });
    }
};
