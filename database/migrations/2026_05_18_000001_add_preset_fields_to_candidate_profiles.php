<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidate_profiles', function (Blueprint $table) {
            $table->string('preset_name', 120)->default('Candidato principal')->after('id');
            $table->boolean('is_active')->default(false)->after('preset_name');
        });

        // Marcar el primer registro existente como activo
        DB::table('candidate_profiles')->limit(1)->update(['is_active' => true]);
    }

    public function down(): void
    {
        Schema::table('candidate_profiles', function (Blueprint $table) {
            $table->dropColumn(['preset_name', 'is_active']);
        });
    }
};
