<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('videos', function (Blueprint $t) {
            $t->id();
            $t->string('title', 255);
            $t->string('url', 500);
            $t->string('thumbnail', 500)->nullable();
            $t->unsignedInteger('views')->default(0);
            $t->string('topic', 40)->nullable()->index();
            $t->timestamp('published_at')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void { Schema::dropIfExists('videos'); }
};
