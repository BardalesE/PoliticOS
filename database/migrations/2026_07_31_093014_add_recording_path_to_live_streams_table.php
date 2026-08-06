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
        Schema::table('live_streams', function (Blueprint $table) {
            // LiveStreamController::stop() y MergeStreamChunksJob ya escriben
            // este campo (['recording_path' => ...]) pero la columna nunca
            // existió — Eloquent lo descartaba en silencio por protección de
            // mass-assignment (no truena, pero tampoco persiste nunca). No
            // afecta la reproducción actual (recording() recalcula la ruta de
            // forma determinística a partir de stream_key), pero cualquier
            // código futuro que lea $stream->recording_path esperaría un valor.
            $table->string('recording_path')->nullable()->after('scheduled_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('live_streams', function (Blueprint $table) {
            $table->dropColumn('recording_path');
        });
    }
};
