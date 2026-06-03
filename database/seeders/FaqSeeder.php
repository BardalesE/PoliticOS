<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class FaqSeeder extends Seeder
{
    public function run(): void
    {
        // FAQs are candidate-specific content.
        // Each tenant loads their own via the admin panel (Admin → FAQs).
    }
}
