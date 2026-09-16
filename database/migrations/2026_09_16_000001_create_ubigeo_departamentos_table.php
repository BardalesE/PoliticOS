<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ubigeo_departamentos', function (Blueprint $table) {
            $table->id();
            $table->string('departamento', 50);
            $table->string('ubigeo', 2)->unique(); // código INEI del departamento
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ubigeo_departamentos');
    }
};
