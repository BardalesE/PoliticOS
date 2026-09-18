<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Soporte para el directorio público de candidatos gratuitos: un único
 * tenant "directorio" (nacional) donde cada candidato gratuito es una fila
 * de `candidate_profiles`, agregado por distrito_id (ya existe desde
 * 2026_09_16_000004) y con su propia URL pública vía `slug`.
 *
 * NO afecta a tenants pagos (camilo/rigo/valle-hermoso en su momento, y los
 * que se den de alta con `tenant:provision`): ahí estos campos quedan en
 * sus defaults (`publicado`/`cliente_pago`) y `slug` en null — no se usan
 * porque esos tenants ya tienen su propio dominio/subdominio, no una ruta
 * `/candidato/{slug}` compartida. Ver CLAUDE.md § "Arquitectura del
 * directorio público".
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('candidate_profiles') || Schema::hasColumn('candidate_profiles', 'slug')) {
            return;
        }

        Schema::table('candidate_profiles', function (Blueprint $table) {
            // Nullable + unique: MySQL permite múltiples NULL bajo un índice
            // unique, así que las filas de tenants pagos (sin necesidad de
            // slug propio) no chocan entre sí. Solo obligatorio en la
            // práctica para filas del tenant "directorio".
            $table->string('slug', 255)->nullable()->unique()->after('name');

            $table->enum('estado_publicacion', ['borrador', 'publicado'])
                ->default('publicado')->after('is_active');
            // Default 'publicado' para no cambiar el comportamiento de
            // ningún candidato ya activo en un tenant pago (siempre visible
            // hoy). El tenant "directorio" es quien realmente usa 'borrador'
            // mientras un candidato gratuito está en carga/procesamiento.

            $table->enum('tipo_cuenta', ['publico_gratuito', 'cliente_pago'])
                ->default('cliente_pago')->after('estado_publicacion');
            // Default 'cliente_pago': todo candidato existente hoy vive en
            // un tenant provisionado con `tenant:provision` (pagado). Las
            // filas nuevas del tenant "directorio" se crean explícitamente
            // con 'publico_gratuito'.
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('candidate_profiles') || !Schema::hasColumn('candidate_profiles', 'slug')) {
            return;
        }

        Schema::table('candidate_profiles', function (Blueprint $table) {
            $table->dropColumn(['slug', 'estado_publicacion', 'tipo_cuenta']);
        });
    }
};
