<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Contadores globales de la plataforma (BD central). Hoy: "views" = cada vez que
 * alguien abre la home (estilo TikTok), con un enfriamiento por dispositivo para
 * que recargar sin parar no infle la cifra.
 *
 * Mismo patrón que site_visitors: connection('central') + guard hasTable, porque
 * tenant:migrate corre esta migración contra cada tenant.
 */
return new class extends Migration
{
    public function up(): void
    {
        $schema = Schema::connection('central');

        if ($schema->hasTable('site_counters')) {
            return;
        }

        $schema->create('site_counters', function (Blueprint $t) {
            $t->string('name', 50)->primary();
            $t->unsignedBigInteger('total')->default(0);
            $t->timestamp('updated_at')->nullable();
        });

        // Arranca en los visitantes únicos que ya había: la cifra nunca baja.
        $unique = $schema->hasTable('site_visitors')
            ? DB::connection('central')->table('site_visitors')->count()
            : 0;

        DB::connection('central')->table('site_counters')->insert([
            'name' => 'views', 'total' => $unique, 'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::connection('central')->dropIfExists('site_counters');
    }
};
