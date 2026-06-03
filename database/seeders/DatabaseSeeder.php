<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            AdminUserSeeder::class,    // login inicial
            AiSettingSeederV2::class,  // configuración técnica IA (prompt dinámico)
            SettingSeeder::class,      // flags de UI
            PlanFeaturesSeeder::class, // planes de suscripción
        ]);
    }
}
