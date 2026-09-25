<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Solicitudes de derechos ARCO (Ley 29733): acceso, rectificación, cancelación,
 * oposición, más reclamos. Las atiende el SUPERADMIN (titular del banco de datos),
 * así que viven en la BD `central` aunque vengan del chat de cualquier tenant.
 *
 * Mismo patrón que site_visitors: `Schema::connection('central')` + guard
 * `hasTable` para que `tenant:migrate` (que corre todo contra cada tenant) no la
 * duplique.
 */
return new class extends Migration
{
    public function up(): void
    {
        $schema = Schema::connection('central');

        if ($schema->hasTable('privacy_requests')) {
            return;
        }

        $schema->create('privacy_requests', function (Blueprint $t) {
            $t->id();
            $t->string('code', 20)->unique();                 // lo que ve el ciudadano: "ARCO-7K2M9QXD"
            $t->string('tenant_slug', 100)->nullable()->index();
            $t->string('type', 20)->index();                  // acceso|rectificacion|cancelacion|oposicion|reclamo
            $t->string('status', 20)->default('recibida')->index(); // recibida|en_proceso|atendida|rechazada
            $t->char('visitor_uuid', 36)->nullable()->index();
            $t->string('name', 150)->nullable();
            $t->string('email', 150)->nullable();
            $t->string('phone', 30)->nullable();
            $t->text('description')->nullable();
            $t->boolean('erased_automatically')->default(false);
            $t->json('erased_counts')->nullable();
            $t->date('due_at')->nullable();                   // plazo legal de respuesta
            $t->timestamp('resolved_at')->nullable();
            $t->text('resolution_note')->nullable();
            $t->char('ip_hash', 64)->nullable();              // HMAC, nunca la IP
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::connection('central')->dropIfExists('privacy_requests');
    }
};
