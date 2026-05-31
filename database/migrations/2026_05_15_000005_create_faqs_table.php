<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('faqs', function (Blueprint $t) {
            $t->id();
            $t->string('question', 500);
            $t->text('answer');
            $t->string('topic', 40)->nullable()->index();
            $t->unsignedTinyInteger('priority')->default(5);
            $t->timestamps();
        });
    }

    public function down(): void { Schema::dropIfExists('faqs'); }
};
