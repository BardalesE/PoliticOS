<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidate_profiles', function (Blueprint $table) {
            $table->id();
            // Identidad
            $table->string('name', 150);
            $table->string('title', 200);
            $table->string('location', 150);
            $table->string('party', 100);
            $table->string('list_number', 10)->default('1');
            $table->text('bio')->nullable();
            $table->string('tagline', 300)->nullable();
            $table->string('election_date', 80)->nullable();
            // Medios
            $table->string('photo_url', 500)->nullable();
            $table->string('hero_photo_url', 500)->nullable();
            $table->string('hero_video_url', 500)->nullable();
            // Marca
            $table->string('color_primary', 20)->default('#DC2626');
            $table->string('color_dark', 20)->default('#7F1D1D');
            $table->string('color_accent', 20)->default('#C9A84C');
            // Redes sociales
            $table->string('tiktok_url', 500)->nullable();
            $table->string('facebook_url', 500)->nullable();
            $table->string('instagram_url', 500)->nullable();
            $table->string('whatsapp_number', 20)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_profiles');
    }
};
