<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Agrega rasgos de personalidad y biografía profunda al candidato.
 * Estos campos se inyectan en el system prompt para que la IA "suene" como el candidato.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('candidate_profiles', function (Blueprint $t) {
            $t->json('personality_traits')->nullable();    // {tone, humor, signature_phrases, voice_style}
            $t->longText('biography_long')->nullable();
            $t->json('signature_phrases')->nullable();     // ["Vamos pa' adelante","Con orden y honestidad"]
            $t->json('forbidden_topics')->nullable();      // temas que la IA evita
            $t->json('priority_topics')->nullable();       // temas que la IA SIEMPRE prioriza
            $t->json('target_segments')->nullable();       // segmentos electorales objetivo
            $t->string('campaign_slogan', 200)->nullable();
            $t->text('attack_response_style')->nullable(); // "firme y conciliador", "directo con datos"
        });
    }

    public function down(): void
    {
        Schema::table('candidate_profiles', function (Blueprint $t) {
            $t->dropColumn([
                'personality_traits','biography_long','signature_phrases',
                'forbidden_topics','priority_topics','target_segments',
                'campaign_slogan','attack_response_style',
            ]);
        });
    }
};
