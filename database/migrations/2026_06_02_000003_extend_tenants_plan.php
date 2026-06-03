<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->enum('plan', ['starter', 'pro', 'elite', 'custom'])
                  ->default('starter')
                  ->change();
            $table->json('custom_features')->nullable()->after('plan');
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->enum('plan', ['starter', 'pro', 'elite'])->default('starter')->change();
            $table->dropColumn('custom_features');
        });
    }
};
