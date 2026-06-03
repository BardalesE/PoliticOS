<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->string('admin_email', 255)->nullable()->after('plan');
            $table->text('admin_password_hint')->nullable()->after('admin_email');
            $table->timestamp('password_changed_at')->nullable()->after('admin_password_hint');
            $table->json('credential_log')->nullable()->after('password_changed_at');
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn(['admin_email', 'admin_password_hint', 'password_changed_at', 'credential_log']);
        });
    }
};
