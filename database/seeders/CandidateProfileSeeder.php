<?php

namespace Database\Seeders;

use App\Models\CandidateProfile;
use Illuminate\Database\Seeder;

class CandidateProfileSeeder extends Seeder
{
    public function run(): void
    {
        CandidateProfile::firstOrCreate([], [
            'name'           => 'Rigo',
            'title'          => 'Candidato a Alcalde Distrital',
            'location'       => 'San Gregorio · Cajamarca',
            'party'          => 'Peru Primero',
            'list_number'    => '1',
            'bio'            => 'Ingeniero civil con amplia experiencia en gestión pública y obras de infraestructura en el distrito de San Gregorio. Comprometido con el desarrollo sostenible y la transparencia en el uso de los recursos públicos.',
            'tagline'        => 'Las obras hablan por si solas.',
            'election_date'  => '4 de octubre de 2026',
            'color_primary'  => '#0F52BA',
            'color_dark'     => '#1A365D',
            'color_accent'   => '#C9A84C',
            'facebook_url'   => 'https://facebook.com/Rigo.alayo',
            'tiktok_url'     => 'https://tiktok.com/@Rigo.alayo',
            'whatsapp_number' => '51982946582',
        ]);
    }
}
