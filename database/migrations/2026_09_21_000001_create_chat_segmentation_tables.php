<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Segmentación del chat por zona + mini encuesta de apoyo (sí/no).
 *
 *  - visitor_segments      → la zona (depto/provincia/distrito) que declara cada visitante.
 *  - candidate_support_votes → un voto sí/no por visitante y candidato (editable).
 *  - chat_messages.candidate_profile_id → sobre qué candidato consultó (para el dashboard).
 *  - ai_settings.support_poll_enabled → interruptor por tenant (lo fija el superadmin).
 *
 * Privacidad (Ley 29733): una opinión política es dato sensible. Solo se guarda el
 * UUID anónimo del navegador + la zona + el voto: sin nombre, sin IP, sin contacto.
 * Sin claves foráneas al ubigeo: ese catálogo se siembra por tenant aparte.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('visitor_segments')) {
            Schema::create('visitor_segments', function (Blueprint $t) {
                $t->id();
                $t->char('visitor_uuid', 36)->unique();
                $t->unsignedBigInteger('departamento_id')->nullable()->index();
                $t->unsignedBigInteger('provincia_id')->nullable()->index();
                $t->unsignedBigInteger('distrito_id')->nullable()->index();
                $t->timestamps();
            });
        }

        if (! Schema::hasTable('candidate_support_votes')) {
            Schema::create('candidate_support_votes', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('candidate_profile_id');
                $t->char('visitor_uuid', 36);
                $t->boolean('supports');
                // Zona del visitante al votar (foto fija: si cambia de zona el voto no se mueve).
                $t->unsignedBigInteger('departamento_id')->nullable();
                $t->unsignedBigInteger('provincia_id')->nullable();
                $t->unsignedBigInteger('distrito_id')->nullable();
                $t->timestamps();

                $t->unique(['candidate_profile_id', 'visitor_uuid'], 'support_votes_candidate_visitor_unique');
                $t->index(['candidate_profile_id', 'supports']);
            });
        }

        if (! Schema::hasColumn('chat_messages', 'candidate_profile_id')) {
            Schema::table('chat_messages', function (Blueprint $t) {
                $t->unsignedBigInteger('candidate_profile_id')->nullable()->index();
            });
        }

        if (! Schema::hasColumn('ai_settings', 'support_poll_enabled')) {
            Schema::table('ai_settings', function (Blueprint $t) {
                $t->boolean('support_poll_enabled')->default(false);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_support_votes');
        Schema::dropIfExists('visitor_segments');

        if (Schema::hasColumn('chat_messages', 'candidate_profile_id')) {
            Schema::table('chat_messages', fn (Blueprint $t) => $t->dropColumn('candidate_profile_id'));
        }
        if (Schema::hasColumn('ai_settings', 'support_poll_enabled')) {
            Schema::table('ai_settings', fn (Blueprint $t) => $t->dropColumn('support_poll_enabled'));
        }
    }
};
