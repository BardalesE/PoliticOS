<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// ChatQuotaService cuenta mensajes por IP en CADA mensaje del chat
// (tope de red 24h). Sin índice es un full scan de chat_sessions: con
// tráfico real (lanzamiento en Facebook) degrada todo el chat.
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('chat_sessions')) {
            return;
        }
        $exists = collect(Schema::getIndexes('chat_sessions'))
            ->contains(fn ($i) => $i['columns'] === ['ip']);
        if (! $exists) {
            Schema::table('chat_sessions', fn (Blueprint $t) => $t->index('ip', 'chat_sessions_ip_index'));
        }
    }

    public function down(): void
    {
        Schema::table('chat_sessions', fn (Blueprint $t) => $t->dropIndex('chat_sessions_ip_index'));
    }
};
