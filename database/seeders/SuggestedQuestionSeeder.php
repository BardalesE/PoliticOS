<?php

namespace Database\Seeders;

use App\Models\SuggestedQuestion;
use Illuminate\Database\Seeder;

class SuggestedQuestionSeeder extends Seeder
{
    public function run(): void
    {
        $questions = [
            ['question' => '¿Qué harás con el agua potable en San Gregorio?', 'topic' => 'agua',      'sort_order' => 1],
            ['question' => '¿Cómo apoyarás a los agricultores?',            'topic' => 'agricultura', 'sort_order' => 2],
            ['question' => '¿Qué propones para mejorar las carreteras?',    'topic' => 'vias',        'sort_order' => 3],
            ['question' => '¿Cuál es tu plan de salud para la provincia?',  'topic' => 'salud',       'sort_order' => 4],
            ['question' => '¿Cómo mejorarás la educación?',                 'topic' => 'educacion',   'sort_order' => 5],
            ['question' => 'Cuéntame sobre tu propuesta de seguridad',      'topic' => 'seguridad',   'sort_order' => 6],
        ];

        foreach ($questions as $q) {
            SuggestedQuestion::firstOrCreate(
                ['question' => $q['question']],
                array_merge($q, ['is_active' => true])
            );
        }
    }
}
