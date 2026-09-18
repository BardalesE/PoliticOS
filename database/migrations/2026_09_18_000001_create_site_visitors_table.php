<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Visitantes únicos de la plataforma (contador "VISITAS" de la home).
 *
 * Es un dato GLOBAL de la plataforma, no de un tenant: vive siempre en la BD
 * `central`. Como `tenant:migrate` corre todas las migraciones contra cada BD
 * de tenant, el `Schema::connection('central')` + el guard `hasTable` la hacen
 * idempotente (la tabla se crea una sola vez, en central, sin importar cuántas
 * veces se ejecute).
 *
 * Privacidad (Ley 29733): NO se guarda la IP. Solo un HMAC-SHA256 con APP_KEY,
 * que sirve para deduplicar pero no permite recuperar la IP original.
 */
return new class extends Migration
{
    public function up(): void
    {
        $schema = Schema::connection('central');

        if ($schema->hasTable('site_visitors')) {
            return;
        }

        $schema->create('site_visitors', function (Blueprint $table) {
            $table->id();
            $table->char('ip_hash', 64)->unique();
            $table->timestamp('first_seen_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::connection('central')->dropIfExists('site_visitors');
    }
};
