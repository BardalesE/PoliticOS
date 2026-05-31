<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('chat_messages', function (Blueprint $t) {
            $t->id();
            $t->foreignId('session_id')->constrained('chat_sessions')->cascadeOnDelete();
            $t->enum('role', ['user', 'james']);
            $t->text('content');
            $t->string('topic', 40)->nullable()->index();
            $t->json('media')->nullable();
            $t->timestamps();

            $t->index(['session_id', 'created_at']);
            $t->index(['role', 'created_at']);
        });
    }

    public function down(): void { Schema::dropIfExists('chat_messages'); }
};
