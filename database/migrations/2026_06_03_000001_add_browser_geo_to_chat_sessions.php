<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_sessions', function (Blueprint $table) {
            // GPS del navegador (distinto de geo_lat/geo_lng que viene de IP)
            $table->decimal('browser_lat', 10, 8)->nullable()->after('geo_lng');
            $table->decimal('browser_lng', 11, 8)->nullable()->after('browser_lat');
            $table->float('browser_accuracy')->nullable()->after('browser_lng');
            $table->timestamp('browser_location_at')->nullable()->after('browser_accuracy');
        });
    }

    public function down(): void
    {
        Schema::table('chat_sessions', function (Blueprint $table) {
            $table->dropColumn(['browser_lat', 'browser_lng', 'browser_accuracy', 'browser_location_at']);
        });
    }
};
