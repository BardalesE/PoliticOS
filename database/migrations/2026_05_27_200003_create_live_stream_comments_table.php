<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('live_stream_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('live_stream_id')->constrained('live_streams')->cascadeOnDelete();
            $table->string('viewer_name', 100);
            $table->string('message', 500);
            $table->timestamps();

            $table->index(['live_stream_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('live_stream_comments');
    }
};
