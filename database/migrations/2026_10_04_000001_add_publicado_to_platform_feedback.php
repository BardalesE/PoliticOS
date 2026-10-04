<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Moderación de comentarios de la calificación: solo los que el superadmin marca
 * como públicos se muestran en la home. Las estrellas cuentan siempre.
 * BD central con guardas (tenant:migrate corre esto contra cada BD).
 */
return new class extends Migration
{
    public function up(): void
    {
        $schema = Schema::connection('central');
        if (! $schema->hasTable('platform_feedback') || $schema->hasColumn('platform_feedback', 'publicado')) {
            return;
        }

        $schema->table('platform_feedback', function (Blueprint $t) {
            $t->boolean('publicado')->default(false)->after('tenant_slug');
            $t->index('publicado');
        });
    }

    public function down(): void
    {
        $schema = Schema::connection('central');
        if ($schema->hasTable('platform_feedback') && $schema->hasColumn('platform_feedback', 'publicado')) {
            $schema->table('platform_feedback', function (Blueprint $t) {
                $t->dropIndex(['publicado']);
                $t->dropColumn('publicado');
            });
        }
    }
};
