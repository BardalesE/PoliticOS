<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaign_photos', function (Blueprint $table) {
            $table->id();
            $table->string('url', 500);
            $table->string('title', 255)->nullable();
            $table->string('category', 60)->default('general')->index();
            $table->unsignedBigInteger('size')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('campaign_photos');
    }
};
