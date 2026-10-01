<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Una fila por llamada a un proveedor de IA (ver App\Services\AiUsage). */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('ai_usage')) {
            return;
        }
        Schema::create('ai_usage', function (Blueprint $t) {
            $t->id();
            $t->string('provider', 20);                  // groq | claude | openai (Gemini u otro compatible)
            $t->string('model', 80)->nullable();
            $t->string('proposito', 20)->default('chat'); // chat | qa | comparador | etiquetas | prueba
            $t->unsignedBigInteger('candidate_profile_id')->nullable();
            $t->unsignedInteger('input_tokens')->default(0);
            $t->unsignedInteger('output_tokens')->default(0);
            $t->unsignedInteger('cache_read_tokens')->default(0);
            $t->unsignedInteger('cache_write_tokens')->default(0);
            $t->decimal('costo_usd', 12, 6)->default(0);   // a precio de lista (aunque el plan sea gratis)
            $t->boolean('estimado')->default(false);      // el proveedor no informó tokens: se estimaron
            $t->boolean('ok')->default(true);             // false = la llamada falló (429, 401, caída)
            $t->unsignedSmallInteger('http_status')->nullable();
            $t->timestamp('created_at')->useCurrent();

            $t->index('created_at');
            $t->index(['provider', 'created_at']);
            $t->index(['candidate_profile_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_usage');
    }
};
