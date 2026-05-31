<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Plantillas de respuesta a ataques políticos comunes.
 * Editables desde el admin. La IA las inyecta en el contexto cuando detecta el keyword.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('attack_responses', function (Blueprint $t) {
            $t->id();
            $t->string('attack_keyword', 100);   // "corrupcion", "indulto", "lava jato"
            $t->json('synonyms')->nullable();    // keywords adicionales
            $t->enum('attack_category', ['personal','partido','pasado','propuesta','rival','otro']);
            $t->text('response_template');
            $t->string('deflection_topic', 40)->nullable();  // tema al que redirige
            $t->unsignedInteger('priority')->default(50);
            $t->boolean('is_active')->default(true);
            $t->unsignedInteger('times_used')->default(0);
            $t->timestamps();

            $t->index(['is_active','priority']);
            $t->index('attack_keyword');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attack_responses');
    }
};
