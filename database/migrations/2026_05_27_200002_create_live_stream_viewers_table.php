<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('live_stream_viewers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('live_stream_id')->constrained('live_streams')->cascadeOnDelete();
            $table->string('viewer_token', 64)->index();   // anonymous session token
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 300)->nullable();
            $table->string('device_type', 20)->nullable(); // mobile|desktop|tablet
            $table->timestamp('watch_start')->useCurrent();
            $table->timestamp('last_ping')->useCurrent();
            $table->unsignedInteger('total_seconds')->default(0);
            $table->timestamps();

            $table->unique(['live_stream_id', 'viewer_token']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('live_stream_viewers');
    }
};
