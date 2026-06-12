<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 2 del roadmap: el rol del asistente deja de llamarse como un candidato.
 *
 * Non-destructiva: amplía el enum, convierte las filas existentes y recién
 * entonces lo estrecha. Corre en la BD de CADA tenant (y en la central):
 * para tenants ya provisionados ejecutar
 *   TenantContext::run('<slug>', fn () => Artisan::call('migrate', ['--force' => true]));
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('chat_messages')) {
            return;
        }

        DB::statement("ALTER TABLE chat_messages MODIFY role ENUM('user','james','assistant') NOT NULL");
        DB::table('chat_messages')->where('role', 'james')->update(['role' => 'assistant']);
        DB::statement("ALTER TABLE chat_messages MODIFY role ENUM('user','assistant') NOT NULL");
    }

    public function down(): void
    {
        if (!Schema::hasTable('chat_messages')) {
            return;
        }

        DB::statement("ALTER TABLE chat_messages MODIFY role ENUM('user','james','assistant') NOT NULL");
        DB::table('chat_messages')->where('role', 'assistant')->update(['role' => 'james']);
        DB::statement("ALTER TABLE chat_messages MODIFY role ENUM('user','james') NOT NULL");
    }
};
