<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contact_verifications', function (Blueprint $table) {
            $table->id();
            $table->string('channel', 12);                 // email | whatsapp
            $table->string('contact', 255);                // correo en minúsculas / teléfono E.164 sin '+'
            $table->string('visitor_uuid', 36)->nullable();
            $table->string('code_hash', 64);               // HMAC-SHA256, nunca el código en claro
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->string('ip', 45)->nullable();
            $table->timestamp('expires_at');
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('consumed_at')->nullable();  // usado por un registro
            $table->timestamps();

            $table->index(['channel', 'contact', 'visitor_uuid'], 'contact_verifications_lookup');
        });

        Schema::table('citizen_profiles', function (Blueprint $table) {
            $table->timestamp('email_verified_at')->nullable()->after('email');
            $table->timestamp('phone_verified_at')->nullable()->after('phone_whatsapp');
        });
    }

    public function down(): void
    {
        Schema::table('citizen_profiles', function (Blueprint $table) {
            $table->dropColumn(['email_verified_at', 'phone_verified_at']);
        });
        Schema::dropIfExists('contact_verifications');
    }
};
