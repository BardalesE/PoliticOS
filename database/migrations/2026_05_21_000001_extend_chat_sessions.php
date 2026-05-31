<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Extiende chat_sessions con geolocalización, dispositivo, UTM y consentimiento.
 * Estos campos alimentan el dashboard de Inteligencia Electoral.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('chat_sessions', function (Blueprint $t) {
            $t->char('visitor_uuid', 36)->nullable()->after('session_id');

            // Geolocalización (resuelta async desde IP)
            $t->string('geo_country', 3)->nullable();
            $t->string('geo_region', 80)->nullable();
            $t->string('geo_city', 80)->nullable();
            $t->decimal('geo_lat', 9, 6)->nullable();
            $t->decimal('geo_lng', 9, 6)->nullable();

            // Dispositivo y origen
            $t->enum('device_type', ['mobile','desktop','tablet','bot','unknown'])->default('unknown');
            $t->string('referrer', 500)->nullable();
            $t->string('utm_source', 80)->nullable();
            $t->string('utm_medium', 80)->nullable();
            $t->string('utm_campaign', 80)->nullable();

            // Métricas de comportamiento
            $t->unsignedInteger('duration_seconds')->default(0);
            $t->unsignedInteger('messages_count')->default(0);

            // Segmento inferido (se actualiza cada N mensajes)
            $t->string('inferred_segment', 40)->nullable();
            $t->string('inferred_intention', 20)->nullable();
            $t->decimal('avg_sentiment', 3, 2)->nullable();

            // Consentimiento Ley 29733
            $t->boolean('consent_data_capture')->default(false);
            $t->timestamp('consent_at')->nullable();

            // Índices para el dashboard
            $t->index(['geo_region', 'created_at']);
            $t->index(['inferred_segment', 'inferred_intention']);
            $t->index('visitor_uuid');
        });
    }

    public function down(): void
    {
        Schema::table('chat_sessions', function (Blueprint $t) {
            $t->dropIndex(['geo_region', 'created_at']);
            $t->dropIndex(['inferred_segment', 'inferred_intention']);
            $t->dropIndex(['visitor_uuid']);
            $t->dropColumn([
                'visitor_uuid','geo_country','geo_region','geo_city','geo_lat','geo_lng',
                'device_type','referrer','utm_source','utm_medium','utm_campaign',
                'duration_seconds','messages_count','inferred_segment','inferred_intention',
                'avg_sentiment','consent_data_capture','consent_at',
            ]);
        });
    }
};
