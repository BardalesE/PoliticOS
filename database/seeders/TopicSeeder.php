<?php

namespace Database\Seeders;

use App\Models\Topic;
use Illuminate\Database\Seeder;

class TopicSeeder extends Seeder
{
    public function run(): void
    {
        $topics = [
            [
                'name'     => 'agua',
                'label'    => 'Agua Potable',
                'emoji'    => '💧',
                'color'    => '#3B82F6',
                'keywords' => ['agua', 'red potable', 'desagüe', 'desague', 'saneamiento', 'alcantarilla', 'cisterna', 'potable'],
                'sort_order' => 1,
            ],
            [
                'name'     => 'agricultura',
                'label'    => 'Agricultura',
                'emoji'    => '🌾',
                'color'    => '#22C55E',
                'keywords' => ['agricultura', 'campo', 'cultivo', 'siembra', 'cosecha', 'agricultor', 'ganadería', 'ganaderia', 'riego', 'canal', 'chacra', 'parcela'],
                'sort_order' => 2,
            ],
            [
                'name'     => 'vias',
                'label'    => 'Vías y Transporte',
                'emoji'    => '🛣️',
                'color'    => '#F59E0B',
                'keywords' => ['carretera', 'pista', 'camino', 'trocha', 'asfalt', 'vía', 'via', 'puente', 'afirmado', 'transporte', 'movilidad'],
                'sort_order' => 3,
            ],
            [
                'name'     => 'salud',
                'label'    => 'Salud',
                'emoji'    => '🏥',
                'color'    => '#EF4444',
                'keywords' => ['salud', 'posta', 'hospital', 'médico', 'medico', 'medicamento', 'enfermedad', 'centro de salud', 'doctor', 'medicina'],
                'sort_order' => 4,
            ],
            [
                'name'     => 'educacion',
                'label'    => 'Educación',
                'emoji'    => '📚',
                'color'    => '#8B5CF6',
                'keywords' => ['educación', 'educacion', 'colegio', 'escuela', 'maestro', 'profesor', 'alumno', 'estudiante', 'enseñanza', 'aprendizaje'],
                'sort_order' => 5,
            ],
            [
                'name'     => 'seguridad',
                'label'    => 'Seguridad',
                'emoji'    => '🛡️',
                'color'    => '#6366F1',
                'keywords' => ['seguridad', 'rondas', 'rondero', 'serenazgo', 'delincuencia', 'robo', 'crimen', 'patrullaje'],
                'sort_order' => 6,
            ],
            [
                'name'     => 'empleo',
                'label'    => 'Empleo y Economía',
                'emoji'    => '💼',
                'color'    => '#F97316',
                'keywords' => ['empleo', 'trabajo', 'chamba', 'puesto', 'oportunidades', 'económico', 'economico', 'laboral', 'experiencia', 'perfil', 'ingreso', 'sueldo'],
                'sort_order' => 7,
            ],
            [
                'name'     => 'turismo',
                'label'    => 'Turismo',
                'emoji'    => '🏔️',
                'color'    => '#14B8A6',
                'keywords' => ['turismo', 'turista', 'paisaje', 'feria', 'artesanía', 'artesania', 'atractivo', 'visita', 'cultura'],
                'sort_order' => 8,
            ],
        ];

        foreach ($topics as $t) {
            Topic::firstOrCreate(
                ['name' => $t['name']],
                array_merge($t, ['is_active' => true])
            );
        }
    }
}
