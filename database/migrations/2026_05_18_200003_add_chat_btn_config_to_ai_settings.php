<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_settings', function (Blueprint $table) {
            $table->string('chat_btn_text', 100)->nullable()->after('chat_subtitle');
            $table->string('chat_btn_image_url', 500)->nullable()->after('chat_btn_text');
            $table->enum('chat_btn_shape', ['pill', 'circle'])->default('pill')->after('chat_btn_image_url');
            $table->string('chat_btn_color', 20)->nullable()->after('chat_btn_shape');
            $table->enum('chat_btn_size', ['sm', 'md', 'lg'])->default('md')->after('chat_btn_color');
            $table->enum('chat_btn_position', ['bottom-right', 'bottom-left'])->default('bottom-right')->after('chat_btn_size');
        });
    }

    public function down(): void
    {
        Schema::table('ai_settings', function (Blueprint $table) {
            $table->dropColumn([
                'chat_btn_text', 'chat_btn_image_url', 'chat_btn_shape',
                'chat_btn_color', 'chat_btn_size', 'chat_btn_position',
            ]);
        });
    }
};
