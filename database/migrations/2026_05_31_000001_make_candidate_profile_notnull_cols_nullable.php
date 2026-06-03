<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidate_profiles', function (Blueprint $table) {
            $table->string('list_number', 10)->nullable()->default('1')->change();
            $table->string('color_primary', 20)->nullable()->default('#DC2626')->change();
            $table->string('color_dark', 20)->nullable()->default('#7F1D1D')->change();
            $table->string('color_accent', 20)->nullable()->default('#C9A84C')->change();
        });
    }

    public function down(): void
    {
        Schema::table('candidate_profiles', function (Blueprint $table) {
            $table->string('list_number', 10)->default('1')->change();
            $table->string('color_primary', 20)->default('#DC2626')->change();
            $table->string('color_dark', 20)->default('#7F1D1D')->change();
            $table->string('color_accent', 20)->nullable(false)->default('#C9A84C')->change();
        });
    }
};
