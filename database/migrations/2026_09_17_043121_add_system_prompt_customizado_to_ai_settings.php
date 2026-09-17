<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Acopla mode -> system_prompt: cuando este flag es false, un cambio de
 * `mode` resincroniza `system_prompt` con el default del modo nuevo
 * (AiSetting::defaultPromptForMode). Se marca true en cuanto el admin edita
 * el prompt a mano, para que un cambio de modo posterior no lo pise.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('ai_settings') || Schema::hasColumn('ai_settings', 'system_prompt_customizado')) {
            return;
        }

        Schema::table('ai_settings', function (Blueprint $table) {
            $table->boolean('system_prompt_customizado')->default(false)->after('system_prompt');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('ai_settings') || !Schema::hasColumn('ai_settings', 'system_prompt_customizado')) {
            return;
        }

        Schema::table('ai_settings', function (Blueprint $table) {
            $table->dropColumn('system_prompt_customizado');
        });
    }
};
