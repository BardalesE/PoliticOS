<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Calificacion (1-5 estrellas) + comentario libre de la PLATAFORMA (no del
 * candidato). Anonimo por diseno: sin IP, sin visitor_uuid, sin nada
 * identificable -> cero tema de privacidad, es feedback de producto.
 *
 * BD central: es un solo contador/listado global, no depende del tenant.
 * Mismo patron que site_visitors/site_counters: connection('central') +
 * guard hasTable, porque tenant:migrate corre esta migracion contra cada BD.
 */
return new class extends Migration
{
    public function up(): void
    {
        $schema = Schema::connection('central');

        if ($schema->hasTable('platform_feedback')) {
            return;
        }

        $schema->create('platform_feedback', function (Blueprint $t) {
            $t->id();
            $t->unsignedTinyInteger('stars');              // 1-5
            $t->string('comment', 500)->nullable();
            $t->string('context', 20)->default('chat');    // 'chat' | 'home'
            $t->string('candidate_slug', 80)->nullable();
            $t->string('tenant_slug', 80)->nullable();
            $t->timestamps();

            $t->index('stars');
            $t->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::connection('central')->dropIfExists('platform_feedback');
    }
};
