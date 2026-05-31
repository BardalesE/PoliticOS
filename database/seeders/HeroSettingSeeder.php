<?php

namespace Database\Seeders;

use App\Models\HeroSetting;
use Illuminate\Database\Seeder;

class HeroSettingSeeder extends Seeder
{
    public function run(): void
    {
        HeroSetting::firstOrCreate(['id' => 1], [
            'title'           => 'Habla con Rigo',
            'subtitle'        => 'Fe en Dios. Trabajo por el pueblo. Sus propuestas, su historia y lo que hará por tu distrito — respuestas reales en segundos.',
            'badge_text'      => 'Primer candidato con IA del Perú',
            'video_url'       => '/hero.mp4',
            'image_url'       => null,
            'overlay_opacity' => 0.70,
            'btn1_label'      => 'Empezar conversación',
            'btn1_url'        => '/chat',
            'btn2_label'      => 'Ver propuestas',
            'btn2_url'        => '/propuestas',
            'btn3_label'      => 'Próximo evento',
            'btn3_url'        => '/#eventos',
            'is_active'       => true,
        ]);
    }
}
