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
            // Soporta el merge de chunks por tandas acotadas en tiempo (ver
            // MergeStreamChunksJob): sin QUEUE_CONNECTION real, un stream de
            // horas no puede mergearse en una sola pasada dentro del timeout
            // de PHP-FPM. merge_cursor guarda el último chunk procesado para
            // poder retomar en la siguiente tanda (cron cada 5 min).
            $table->enum('merge_status', ['none', 'pending', 'processing', 'done', 'failed'])
                ->default('none')
                ->after('recording_path');
            $table->unsignedInteger('merge_cursor')->default(0)->after('merge_status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('live_streams', function (Blueprint $table) {
            $table->dropColumn(['merge_status', 'merge_cursor']);
        });
    }
};
