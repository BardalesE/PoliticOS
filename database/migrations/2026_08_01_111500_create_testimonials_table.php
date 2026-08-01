<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Testimonios ciudadanos del rediseño narrativo del sitio público — no
 * existía ningún concepto parecido en el proyecto (confirmado por auditoría:
 * 0 resultados de "testimon" en todo el repo antes de esta migración).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('testimonials', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('role', 150)->nullable();  // "Vecina de San Isidro"
            $table->string('photo_url', 500)->nullable();
            $table->text('quote');
            $table->string('district', 100)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('testimonials');
    }
};
