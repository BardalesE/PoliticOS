<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_settings', function (Blueprint $table) {
            $table->id();
            $table->enum('provider', ['groq', 'claude', 'openai'])->default('groq');
            $table->string('model', 100)->default('llama-3.3-70b-versatile');
            // 1200 = mismo piso que CivicAIService::MIN_MAX_TOKENS. Antes era
            // 600, que en modo campaña truncaba respuestas sin protección
            // (el piso solo se aplicaba en modo PEPA). Unificado con
            // AiSetting::current() y AiSettingSeederV2 — ver informe de QA.
            $table->unsignedSmallInteger('max_tokens')->default(1200);
            // temperature más baja = respuestas más deterministas/precisas.
            $table->decimal('temperature', 3, 2)->default(0.4);
            $table->enum('fallback_provider', ['groq', 'claude', 'openai'])->nullable();
            $table->longText('system_prompt');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_settings');
    }
};
