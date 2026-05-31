<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Perfil persistente del visitante (basado en cookie UUID).
 * Permite memoria conversacional cross-sesión sin recolectar PII.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('visitor_profiles', function (Blueprint $t) {
            $t->id();
            $t->char('visitor_uuid', 36)->unique();

            // Datos inferidos (no declarados)
            $t->string('inferred_age_range', 20)->nullable();   // 18-25|26-35|36-50|50+
            $t->string('inferred_district', 100)->nullable();
            $t->string('inferred_segment', 40)->nullable();
            $t->string('inferred_intention', 20)->nullable();
            $t->decimal('avg_sentiment', 3, 2)->nullable();

            // Métricas de comportamiento
            $t->unsignedInteger('visits_count')->default(1);
            $t->unsignedInteger('total_messages')->default(0);
            $t->unsignedInteger('total_duration_seconds')->default(0);

            // Memoria de temas
            $t->json('last_topics')->nullable();
            $t->json('detected_concerns')->nullable();

            // Consentimiento
            $t->boolean('consented')->default(false);
            $t->timestamp('consented_at')->nullable();

            $t->timestamp('first_seen_at')->useCurrent();
            $t->timestamp('last_seen_at')->useCurrent();
            $t->timestamps();

            $t->index(['inferred_district','inferred_segment']);
            $t->index('last_seen_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('visitor_profiles');
    }
};
