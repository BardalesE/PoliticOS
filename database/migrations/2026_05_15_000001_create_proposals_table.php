<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('proposals', function (Blueprint $t) {
            $t->id();
            $t->string('title', 255);
            $t->text('description');
            $t->string('district', 80)->nullable()->index();
            $t->string('topic', 40)->index();
            $t->decimal('budget', 12, 2)->nullable();
            $t->unsignedTinyInteger('priority')->default(5);
            $t->enum('status', ['propuesta', 'en_curso', 'completada'])->default('propuesta');
            $t->string('image', 500)->nullable();
            $t->string('document_url', 500)->nullable();
            $t->timestamps();
        });
    }

    public function down(): void { Schema::dropIfExists('proposals'); }
};
