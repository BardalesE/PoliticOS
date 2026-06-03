<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class SuggestedQuestionSeeder extends Seeder
{
    public function run(): void
    {
        // Suggested questions are candidate-specific content.
        // Each tenant configures their own via the admin panel (Admin → Preguntas sugeridas).
    }
}
