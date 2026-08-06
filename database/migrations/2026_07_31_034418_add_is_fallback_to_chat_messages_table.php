<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            // Marca el mensaje de "descanso" (todos los providers de IA fallaron).
            // getConversationHistory() lo excluye del contexto que se manda de
            // vuelta al LLM — sin esto, el mensaje de fallback (con 5 propuestas
            // completas) entraba como contexto en el siguiente mensaje y
            // empeoraba el consumo de tokens justo cuando ya estaba fallando.
            $table->boolean('is_fallback')->default(false)->after('pepa_metadata');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->dropColumn('is_fallback');
        });
    }
};
