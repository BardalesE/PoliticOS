<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenants', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 60)->unique();         // "james", "maria"
            $table->string('name', 150);                  // "James Cueva"
            $table->string('db_name', 100);               // "bdpolitic_james"
            $table->string('db_host', 100)->default('127.0.0.1');
            $table->unsignedSmallInteger('db_port')->default(3306);
            $table->string('db_user', 100)->default('root');
            $table->string('db_password', 255)->default('');
            $table->enum('plan', ['starter', 'pro', 'elite'])->default('starter');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenants');
    }
};
