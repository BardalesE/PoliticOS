<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('chat_sessions', function (Blueprint $t) {
            $t->unsignedTinyInteger('nonsense_count')->default(0)->after('messages_count');
            $t->timestamp('blocked_at')->nullable()->after('nonsense_count');
        });
    }

    public function down(): void
    {
        Schema::table('chat_sessions', function (Blueprint $t) {
            $t->dropColumn(['nonsense_count', 'blocked_at']);
        });
    }
};
