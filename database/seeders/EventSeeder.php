<?php

namespace Database\Seeders;

use App\Models\Event;
use Illuminate\Database\Seeder;

class EventSeeder extends Seeder
{
    public function run(): void
    {
        if (Event::count() > 0) return;

        Event::insert([
            [
                'title'       => 'Elecciones Municipales 2026',
                'description' => 'El día del cambio para San Gregorio. Acompáñanos a las urnas y vota por Rigo y la Peru Primero.',
                'event_date'  => '2026-10-04 08:00:00',
                'location'    => 'Distrito de San Gregorio',
                'address'     => 'San Gregorio, Cajamarca',
                'image_url'   => null,
                'stream_url'  => null,
                'is_active'   => true,
                'is_featured' => true,
                'sort_order'  => 100,
                'created_at'  => now(),
                'updated_at'  => now(),
            ],
            [
                'title'       => 'Gran Mitin de Campaña',
                'description' => 'El evento más importante de la campaña. Toda la distrito unida por el cambio y el progreso de San Gregorio.',
                'event_date'  => '2026-09-20 15:00:00',
                'location'    => 'Plaza de Armas',
                'address'     => 'San Gregorio, Cajamarca',
                'image_url'   => null,
                'stream_url'  => null,
                'is_active'   => true,
                'is_featured' => true,
                'sort_order'  => 1,
                'created_at'  => now(),
                'updated_at'  => now(),
            ],
        ]);
    }
}
