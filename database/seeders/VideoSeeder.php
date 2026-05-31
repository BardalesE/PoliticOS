<?php

namespace Database\Seeders;

use App\Models\Video;
use Illuminate\Database\Seeder;

class VideoSeeder extends Seeder
{
    public function run(): void
    {
        $videos = [
            [
                'title'        => 'Año Nuevo 2026 — Mensaje al pueblo',
                'url'          => 'https://www.tiktok.com/@Rigo.alayo/video/sample-4',
                'thumbnail'    => '/videos/ano-nuevo.jpg',
                'views'        => 6428,
                'topic'        => null,
                'published_at' => now()->subMonths(5),
            ],
            [
                'title'        => 'Compromisos navideños',
                'url'          => 'https://www.tiktok.com/@Rigo.alayo/video/sample-5',
                'thumbnail'    => '/videos/navidad.jpg',
                'views'        => 4021,
                'topic'        => null,
                'published_at' => now()->subMonths(6),
            ],
            
        ];

        foreach ($videos as $v) Video::create($v);
    }
}
