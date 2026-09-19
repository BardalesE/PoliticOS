<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Citas verificables de cada respuesta de la IA: [{id:"S1", document_id, title,
 * page, excerpt, url}]. Se guardan con el mensaje para que al reabrir la
 * conversación las etiquetas [S1] sigan siendo clicables.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->json('citations')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->dropColumn('citations');
        });
    }
};
