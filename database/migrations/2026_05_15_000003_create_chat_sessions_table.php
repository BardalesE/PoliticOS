<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('chat_sessions', function (Blueprint $t) {
            $t->id();
            $t->string('session_id', 64)->unique();
            $t->string('ip', 45)->nullable();
            $t->string('user_agent', 500)->nullable();
            $t->timestamp('started_at')->nullable();
            $t->timestamps();

            $t->index(['started_at']);
        });
    }

    public function down(): void { Schema::dropIfExists('chat_sessions'); }
};
