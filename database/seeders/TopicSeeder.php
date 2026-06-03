<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class TopicSeeder extends Seeder
{
    public function run(): void
    {
        // Topics are seeded per-tenant by TenantProvision::seedTopics() (16 topics).
        // Each tenant can manage their own via the admin panel (Admin → Temas).
    }
}
