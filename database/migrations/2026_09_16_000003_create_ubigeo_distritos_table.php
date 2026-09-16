<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ubigeo_distritos', function (Blueprint $table) {
            $table->id();
            $table->string('distrito', 150);
            $table->string('ubigeo', 6)->unique();
            $table->foreignId('provincia_id')->constrained('ubigeo_provincias');
            $table->foreignId('departamento_id')->constrained('ubigeo_departamentos');
            $table->timestamps();
            $table->index(['departamento_id', 'provincia_id']); // acelera el filtro en cascada
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ubigeo_distritos');
    }
};
