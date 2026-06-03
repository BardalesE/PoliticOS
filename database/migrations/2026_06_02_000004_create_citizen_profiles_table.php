<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('citizen_profiles', function (Blueprint $table) {
            $table->id();

            // Identidad primaria
            $table->string('visitor_uuid', 36)->nullable()->index(); // liga al perfil persistente por cookie
            $table->string('name', 150)->nullable();
            $table->string('phone_whatsapp', 20)->nullable()->index();
            $table->string('email', 255)->nullable()->index();
            $table->string('dni', 20)->nullable()->index();         // opcional, no requerido

            // Ubicación y perfil
            $table->string('district', 100)->nullable();
            $table->string('age_range', 20)->nullable();           // 18-25, 26-35, etc.
            $table->string('occupation', 100)->nullable();
            $table->enum('voting_intention', ['alta', 'media', 'baja', 'opositor', 'indeciso'])->nullable();

            // Gamificación
            $table->unsignedInteger('points_balance')->default(0);
            $table->string('referral_code', 16)->unique()->nullable(); // código único para compartir
            $table->string('referred_by_code', 16)->nullable()->index(); // quien lo invitó

            // Origen del registro
            $table->enum('source', ['chat', 'web_form', 'qr', 'referral'])->default('chat');

            // Consentimiento (Ley 29733)
            $table->boolean('consented')->default(false);
            $table->timestamp('consent_at')->nullable();
            $table->string('consent_ip', 45)->nullable();

            // Anti-duplicados
            $table->boolean('is_verified')->default(false);
            $table->integer('duplicate_score')->default(0); // 0=único, >50=posible duplicado

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('citizen_profiles');
    }
};
