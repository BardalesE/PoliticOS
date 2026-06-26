<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Jornada de encuestas boca a boca (corre en la BD del tenant; el tenant
        // ES el candidato, por eso NO lleva candidate_id). Agrupa respuestas por
        // lugar/distrito/provincia/fecha. Sin GPS: el lugar se escribe a mano.
        Schema::create('survey_journeys', function (Blueprint $table) {
            $table->id();

            // Dedup offline: el celular genera el uuid de la jornada y lo reenvía
            // en cada sync. Permite reenviar el mismo lote sin crear jornadas nuevas.
            $table->uuid('client_uuid')->nullable()->unique();

            $table->string('place', 150);                  // escrito a mano (sin GPS)
            $table->string('district', 100)->nullable();
            $table->string('province', 100)->nullable();
            $table->date('surveyed_on');                   // fecha de la jornada

            $table->foreignId('created_by')->nullable()    // usuario que la creó/sincronizó
                  ->constrained('users')->nullOnDelete();

            $table->timestamps();

            $table->index(['surveyed_on', 'district']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('survey_journeys');
    }
};
