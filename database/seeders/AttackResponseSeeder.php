<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class AttackResponseSeeder extends Seeder
{
    public function run(): void
    {
        // Attack responses are candidate-specific political strategies.
        // New tenants get generic templates via TenantProvision::seedAttackResponses().
        // Custom responses are managed via the admin panel (Admin → Respuestas a ataques).
    }
}
