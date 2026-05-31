<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Alertas automáticas para el comando de campaña.
 * Disparadas por: spike de ataques, drop de sentimiento, viralización, nuevo concern.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('intel_alerts', function (Blueprint $t) {
            $t->id();
            $t->enum('severity', ['low','medium','high','critical']);
            $t->string('type', 40);   // attack_spike|sentiment_drop|viral_topic|new_concern|attack_response_needed
            $t->string('title', 200);
            $t->text('description');
            $t->json('payload')->nullable();
            $t->string('source_table', 40)->nullable();
            $t->unsignedBigInteger('source_id')->nullable();
            $t->boolean('acknowledged')->default(false);
            $t->timestamp('acknowledged_at')->nullable();
            $t->unsignedBigInteger('acknowledged_by')->nullable();
            $t->timestamp('triggered_at');
            $t->timestamps();

            $t->index(['severity','acknowledged','triggered_at']);
            $t->index(['type','triggered_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('intel_alerts');
    }
};
