<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Datos voluntariamente declarados por el ciudadano en el chat.
 * Solo se inserta si consent_data_capture = true en la sesión.
 * NUNCA se almacena DNI, teléfono, dirección exacta (Ley 29733).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('citizen_data', function (Blueprint $t) {
            $t->id();
            $t->foreignId('session_id')->constrained('chat_sessions')->cascadeOnDelete();
            $t->char('visitor_uuid', 36)->nullable();
            $t->string('field_name', 40);     // edad|profesion|distrito|intencion_voto|preocupacion|sexo
            $t->string('field_value', 200);
            $t->decimal('confidence', 3, 2)->default(1.00); // si fue extraído por IA vs declarado
            $t->enum('source', ['declared','inferred'])->default('declared');
            $t->timestamps();

            $t->index(['field_name','field_value']);
            $t->index('visitor_uuid');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('citizen_data');
    }
};
