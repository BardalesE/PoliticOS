<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mensajes extra que gana quien deja sus datos cuando se agota el bloque inicial
 * (ai_settings.max_messages_per_session). Antes el bonus era igual al bloque (N);
 * ahora es independiente: p. ej. 10 mensajes gratis y 50 más al registrarse.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('ai_settings', 'registration_bonus_messages')) {
            Schema::table('ai_settings', function (Blueprint $t) {
                $t->unsignedSmallInteger('registration_bonus_messages')->default(50);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('ai_settings', 'registration_bonus_messages')) {
            Schema::table('ai_settings', fn (Blueprint $t) => $t->dropColumn('registration_bonus_messages'));
        }
    }
};
