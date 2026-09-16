<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ubigeo_provincias', function (Blueprint $table) {
            $table->id();
            $table->string('provincia', 100);
            $table->string('ubigeo', 4)->unique();
            $table->foreignId('departamento_id')->constrained('ubigeo_departamentos');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ubigeo_provincias');
    }
};
