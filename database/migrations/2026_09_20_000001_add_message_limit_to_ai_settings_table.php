<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tope de mensajes por conversación del chat público, por candidato (tenant).
 * Rango permitido 10–50 (lo valida el controlador); 20 por defecto.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_settings', function (Blueprint $table) {
            $table->unsignedSmallInteger('max_messages_per_session')->default(20);
        });
    }

    public function down(): void
    {
        Schema::table('ai_settings', function (Blueprint $table) {
            $table->dropColumn('max_messages_per_session');
        });
    }
};
