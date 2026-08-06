<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Complementa 2026_07_09_210000_add_visited_place_fields_to_districts_table:
// el admin quiere poder subir un video del lugar visitado además de la foto
// (mismo patrón — todo nullable, un distrito sigue siendo válido sin esto).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('districts', function (Blueprint $table) {
            $table->string('highlight_video_url', 500)->nullable()->after('highlight_photo_url');
        });
    }

    public function down(): void
    {
        Schema::table('districts', function (Blueprint $table) {
            $table->dropColumn('highlight_video_url');
        });
    }
};
