<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('hero_settings', function (Blueprint $table) {
            $table->id();
            $table->string('title', 200)->default('Habla con James');
            $table->string('subtitle', 600)->nullable();
            $table->string('badge_text', 150)->nullable();
            $table->string('video_url', 500)->nullable();
            $table->string('image_url', 500)->nullable();
            $table->decimal('overlay_opacity', 3, 2)->default(0.70);
            $table->string('btn1_label', 100)->nullable();
            $table->string('btn1_url', 300)->nullable();
            $table->string('btn2_label', 100)->nullable();
            $table->string('btn2_url', 300)->nullable();
            $table->string('btn3_label', 100)->nullable();
            $table->string('btn3_url', 300)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hero_settings');
    }
};
