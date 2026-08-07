<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Carrusel de fondo del Hero: antes solo admitía UN video o UNA imagen de
// fondo (columnas video_url/image_url en hero_settings, que se conservan
// como fallback legacy). Esta tabla permite subir varias fotos y videos que
// rotan en el fondo del Hero (ver Hero.tsx + admin/hero-settings).
return new class extends Migration {
    public function up(): void
    {
        Schema::create('hero_media', function (Blueprint $table) {
            $table->id();
            $table->string('url', 500);
            $table->enum('type', ['image', 'video']);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hero_media');
    }
};
