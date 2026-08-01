<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Campos narrativos del rediseño del sitio público — a diferencia de las
 * columnas de personalidad de 2026_05_21_000008 (esas son $hidden, solo
 * alimentan el system prompt del chat), estos son PÚBLICOS a propósito:
 * los consume directamente la página pública, no la IA.
 *
 * bio_timeline: el frontend (BioSection.tsx) ya esperaba este nombre de
 * campo desde antes de esta migración (ver el TODO(backend) que quedó en
 * ese componente) — nunca existía la columna, así que la sección de línea
 * de tiempo nunca tenía datos que mostrar.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('candidate_profiles', function (Blueprint $t) {
            // [{year, title, detail, photo_url, category}]
            $t->json('bio_timeline')->nullable()->after('bio');
            $t->text('why_running')->nullable()->after('bio_timeline');
            $t->string('differentiator', 300)->nullable()->after('why_running');
            $t->string('testimonial_video_url', 500)->nullable()->after('hero_video_url');
        });
    }

    public function down(): void
    {
        Schema::table('candidate_profiles', function (Blueprint $t) {
            $t->dropColumn(['bio_timeline', 'why_running', 'differentiator', 'testimonial_video_url']);
        });
    }
};
