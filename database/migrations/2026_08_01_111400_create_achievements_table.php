<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Obras destacadas" del rediseño narrativo del sitio público — distinto de
 * `districts` (que es "presencia/visitas de campaña", ver
 * 2026_07_09_210000_add_visited_place_fields_to_districts_table.php): esto
 * es un logro concreto con métrica y foto antes/después, no una visita.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('achievements', function (Blueprint $table) {
            $table->id();
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->string('metric_label', 100)->nullable();  // "familias beneficiadas"
            $table->string('metric_value', 50)->nullable();   // "120"
            $table->string('photo_before_url', 500)->nullable();
            $table->string('photo_after_url', 500)->nullable();
            $table->string('district', 100)->nullable();
            $table->enum('status', ['completado', 'en_curso'])->default('completado');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('achievements');
    }
};
