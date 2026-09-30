<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Ámbito del candidato según su cargo (2026-09-30):
 *   regional   → solo departamento_id  (Gobernador, Vicegobernador, Consejero)
 *   provincial → departamento_id + provincia_id
 *   distrital  → los tres (lo de siempre)
 * Antes todo exigía distrito: un gobernador quedaba atado a "Trujillo distrito"
 * y no aparecía para quien vota en Ascope o Chepén.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidate_profiles', function (Blueprint $table) {
            if (! Schema::hasColumn('candidate_profiles', 'departamento_id')) {
                $table->foreignId('departamento_id')->nullable()->after('distrito_id')
                    ->constrained('ubigeo_departamentos')->nullOnDelete();
            }
            if (! Schema::hasColumn('candidate_profiles', 'provincia_id')) {
                $table->foreignId('provincia_id')->nullable()->after('departamento_id')
                    ->constrained('ubigeo_provincias')->nullOnDelete();
            }
        });

        // Los candidatos existentes (todos distritales) heredan provincia y departamento de su distrito.
        DB::table('candidate_profiles')->whereNotNull('distrito_id')->orderBy('id')->each(function ($c) {
            $d = DB::table('ubigeo_distritos')->where('id', $c->distrito_id)->first(['provincia_id', 'departamento_id']);
            if ($d) {
                DB::table('candidate_profiles')->where('id', $c->id)->update([
                    'provincia_id'    => $d->provincia_id,
                    'departamento_id' => $d->departamento_id,
                ]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('candidate_profiles', function (Blueprint $table) {
            if (Schema::hasColumn('candidate_profiles', 'provincia_id')) {
                $table->dropConstrainedForeignId('provincia_id');
            }
            if (Schema::hasColumn('candidate_profiles', 'departamento_id')) {
                $table->dropConstrainedForeignId('departamento_id');
            }
        });
    }
};
