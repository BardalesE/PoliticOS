<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Seeder maestro de PoliticOS v2.
 *
 * Uso: php artisan db:seed --class=DatabaseSeederV2
 *
 * IMPORTANTE: si vas a setear el sistema desde cero, ejecuta primero
 * los seeders originales (CandidateProfile, Districts, etc.) y luego éste.
 */
class DatabaseSeederV2 extends Seeder
{
    public function run(): void
    {
        $this->call([
            TopicSeederV2::class,
            AttackResponseSeeder::class,
            AiSettingSeederV2::class,
        ]);
    }
}
