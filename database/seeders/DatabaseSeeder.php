<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            // Tenant (multi-tenancy)
            TenantSeeder::class,

            // Configuración del candidato
            CandidateProfileSeeder::class,
            AiSettingSeeder::class,
            DistrictSeeder::class,
            TopicSeeder::class,
            SuggestedQuestionSeeder::class,

            // Contenido
            AdminUserSeeder::class,
            ProposalSeeder::class,
            FaqSeeder::class,
            VideoSeeder::class,

            // Landing page
            HeroSettingSeeder::class,
            EventSeeder::class,
            SettingSeeder::class,
        ]);
    }
}
