<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Extiende chat_messages con análisis emocional, intención y detección de ataques.
 * Estos campos se rellenan async vía AnalyzeMessageJob (Groq Llama-8B).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('chat_messages', function (Blueprint $t) {
            $t->decimal('sentiment', 3, 2)->nullable();           // -1.00 a 1.00
            $t->string('emotion', 20)->nullable();                // miedo|enojo|esperanza|frustracion|alegria|neutral
            $t->string('intent', 20)->nullable();                 // pregunta|critica|apoyo|ataque|duda|saludo
            $t->json('concerns')->nullable();                     // ["empleo","seguridad"]
            $t->boolean('attack_detected')->default(false);
            $t->string('attack_category', 40)->nullable();        // personal|partido|pasado|propuesta
            $t->json('analysis_raw')->nullable();                 // payload completo del clasificador

            $t->index(['sentiment', 'created_at']);
            $t->index(['attack_detected', 'created_at']);
            $t->index(['intent', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $t) {
            $t->dropIndex(['sentiment', 'created_at']);
            $t->dropIndex(['attack_detected', 'created_at']);
            $t->dropIndex(['intent', 'created_at']);
            $t->dropColumn([
                'sentiment','emotion','intent','concerns',
                'attack_detected','attack_category','analysis_raw',
            ]);
        });
    }
};
