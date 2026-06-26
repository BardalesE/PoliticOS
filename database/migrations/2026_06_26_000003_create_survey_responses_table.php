<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Una respuesta = una persona encuestada en campo. Único campo obligatorio:
        // vote_intention. Datos personales opcionales y solo si consiente (Ley 29733).
        Schema::create('survey_responses', function (Blueprint $table) {
            $table->id();

            // Dedup offline: el celular genera el uuid de cada respuesta. El sync
            // hace firstOrCreate por client_uuid, así reenviar el lote no duplica votos.
            $table->uuid('client_uuid')->unique();

            $table->foreignId('survey_journey_id')->constrained('survey_journeys')->cascadeOnDelete();

            // Intención de voto — ÚNICO obligatorio
            $table->enum('vote_intention', ['si', 'no', 'indeciso']);

            // ¿Conocía la propuesta del candidato? (opcional)
            $table->boolean('knew_proposal')->nullable();

            // Consentimiento (Ley 29733). Si no consiente, los campos personales
            // quedan en null: NO se guardan.
            $table->boolean('consented')->default(false);
            $table->string('consent_ip', 45)->nullable();

            // Datos personales OPCIONALES (solo con consentimiento)
            $table->string('name', 150)->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('dni', 20)->nullable();
            $table->unsignedTinyInteger('age')->nullable();
            $table->enum('sex', ['M', 'F', 'otro'])->nullable();

            // Momento de captura en el dispositivo (puede diferir del sync)
            $table->timestamp('captured_at')->nullable();

            $table->foreignId('created_by')->nullable()
                  ->constrained('users')->nullOnDelete();

            $table->timestamps();

            $table->index(['survey_journey_id', 'vote_intention']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('survey_responses');
    }
};
