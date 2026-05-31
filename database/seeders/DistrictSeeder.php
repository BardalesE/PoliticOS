<?php

namespace Database\Seeders;

use App\Models\District;
use Illuminate\Database\Seeder;

class DistrictSeeder extends Seeder
{
    public function run(): void
    {
        $districts = [
            ['name' => 'San Miguel de Pallaques', 'keywords' => ['san miguel de pallaques', 'san miguel', 'pallaques'], 'sort_order' => 1],
            ['name' => 'Calquis',                 'keywords' => ['calquis'],                           'sort_order' => 2],
            ['name' => 'Catilluc',                'keywords' => ['catilluc'],                          'sort_order' => 3],
            ['name' => 'El Prado',                'keywords' => ['el prado', 'prado'],                 'sort_order' => 4],
            ['name' => 'La Florida',              'keywords' => ['la florida', 'florida'],             'sort_order' => 5],
            ['name' => 'Llapa',                   'keywords' => ['llapa'],                             'sort_order' => 6],
            ['name' => 'Nanchoc',                 'keywords' => ['nanchoc'],                           'sort_order' => 7],
            ['name' => 'Niepos',                  'keywords' => ['niepos'],                            'sort_order' => 8],
            ['name' => 'San Gregorio',            'keywords' => ['san gregorio'],                      'sort_order' => 9],
            ['name' => 'San Silvestre',           'keywords' => ['san silvestre'],                     'sort_order' => 10],
            ['name' => 'Cochán',                  'keywords' => ['cochán', 'cochan'],                  'sort_order' => 11],
            ['name' => 'Tongod',                  'keywords' => ['tongod'],                            'sort_order' => 12],
            ['name' => 'Bolívar',                 'keywords' => ['bolívar', 'bolivar', 'agua blanca'], 'sort_order' => 13],
        ];

        foreach ($districts as $d) {
            District::firstOrCreate(
                ['name' => $d['name']],
                ['keywords' => $d['keywords'], 'sort_order' => $d['sort_order'], 'is_active' => true]
            );
        }
    }
}
