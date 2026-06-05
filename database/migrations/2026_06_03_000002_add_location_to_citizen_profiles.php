<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('citizen_profiles', function (Blueprint $table) {
            // GPS del navegador al momento del registro
            $table->decimal('browser_lat', 10, 8)->nullable()->after('duplicate_score');
            $table->decimal('browser_lng', 11, 8)->nullable()->after('browser_lat');
            $table->float('browser_accuracy')->nullable()->after('browser_lng');
            $table->timestamp('browser_location_at')->nullable()->after('browser_accuracy');

            // Resultado de reverse geocoding (Nominatim)
            $table->string('location_district', 100)->nullable()->after('browser_location_at');
            $table->string('location_province', 100)->nullable()->after('location_district');
            $table->string('location_department', 100)->nullable()->after('location_province');
            $table->string('location_address', 500)->nullable()->after('location_department');
            $table->timestamp('location_geocoded_at')->nullable()->after('location_address');

            $table->index(['browser_lat', 'browser_lng']);
        });
    }

    public function down(): void
    {
        Schema::table('citizen_profiles', function (Blueprint $table) {
            $table->dropIndex(['browser_lat', 'browser_lng']);
            $table->dropColumn([
                'browser_lat', 'browser_lng', 'browser_accuracy', 'browser_location_at',
                'location_district', 'location_province', 'location_department',
                'location_address', 'location_geocoded_at',
            ]);
        });
    }
};
