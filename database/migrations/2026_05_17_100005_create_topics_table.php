<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('topics', function (Blueprint $table) {
            $table->id();
            $table->string('name', 40)->unique();          // slug: "agua"
            $table->string('label', 100);                  // display: "Agua Potable"
            $table->string('emoji', 10)->default('📋');
            $table->json('keywords');                      // ["agua", "red potable", "saneamiento"]
            $table->string('color', 20)->default('#3B82F6');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('topics');
    }
};
