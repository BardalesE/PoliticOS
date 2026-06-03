<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('citizen_points', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('citizen_profile_id')->index();
            $table->enum('action', [
                'registro',          // 50 pts — se registra por primera vez
                'primer_mensaje',    // 10 pts — primera conversación
                'conversacion',      // 5 pts  — cada conversación (1 por sesión)
                'referido_exitoso',  // 100 pts — alguien se registra con su código
                'perfil_completo',   // 20 pts  — completa nombre+whatsapp+distrito
                'encuesta',          // 15 pts  — responde encuesta opcional
                'compartir',         // 10 pts  — comparte en redes (claim manual)
            ]);
            $table->unsignedInteger('points')->default(0);
            $table->json('metadata')->nullable(); // info adicional (session_id, etc.)
            $table->timestamps();

            $table->foreign('citizen_profile_id')
                  ->references('id')->on('citizen_profiles')
                  ->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('citizen_points');
    }
};
