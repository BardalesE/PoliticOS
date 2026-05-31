<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Clusters de preguntas frecuentes generados por el job nocturno.
 * Reemplaza el GROUP BY SUBSTRING(content, 1, 80) horrible del AnalyticsController.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('question_clusters', function (Blueprint $t) {
            $t->id();
            $t->string('cluster_label', 200);          // "Empleo para jóvenes"
            $t->text('representative_question');       // pregunta más representativa
            $t->string('topic', 40)->nullable();
            $t->unsignedInteger('message_count');
            $t->json('sample_questions')->nullable();  // 5 preguntas de ejemplo
            $t->json('sample_message_ids')->nullable();
            $t->decimal('avg_sentiment', 3, 2)->nullable();
            $t->date('analyzed_date');                  // día del análisis
            $t->timestamps();

            $t->index(['analyzed_date','message_count']);
            $t->index(['topic','analyzed_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('question_clusters');
    }
};
