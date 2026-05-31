<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Señales externas (noticias, redes, encuestas) ingresadas por el servicio Python.
 * El feed alimenta el dashboard de Inteligencia y dispara intel_alerts cuando detecta spikes.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('external_signals', function (Blueprint $t) {
            $t->id();
            $t->enum('source', [
                'twitter','news','youtube_comment','tiktok','facebook',
                'poll','gov_pdf','blog','reddit','manual'
            ]);
            $t->string('source_url', 500)->nullable();
            $t->string('source_name', 120)->nullable();   // "RPP Noticias", "Datum"
            $t->string('author', 120)->nullable();
            $t->text('title')->nullable();
            $t->mediumText('content');
            $t->json('mentions')->nullable();             // ["keiko","jp"]
            $t->decimal('sentiment', 3, 2)->nullable();
            $t->string('emotion', 20)->nullable();
            $t->string('topic', 40)->nullable();
            $t->boolean('is_attack')->default(false);
            $t->string('target_candidate', 40)->nullable();
            $t->unsignedInteger('engagement')->default(0); // likes+shares+comments si aplica
            $t->timestamp('captured_at');
            $t->timestamps();

            $t->index(['source','captured_at']);
            $t->index(['target_candidate','sentiment']);
            $t->index(['topic','captured_at']);
            $t->index(['is_attack','captured_at']);
            $t->unique(['source','source_url'], 'unique_source_url');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('external_signals');
    }
};
