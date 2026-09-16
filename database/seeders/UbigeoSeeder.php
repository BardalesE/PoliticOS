<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class UbigeoSeeder extends Seeder
{
    public function run(): void
    {
        $path = database_path('seeders/data/');

        // Los JSON del repo ubigeos-peru-data envuelven el array en una clave
        // raíz (ubigeo_departamentos / ubigeo_provincias / ubigeo_distritos).
        $departamentos = json_decode(file_get_contents($path . '1_ubigeo_departamentos.json'), true)['ubigeo_departamentos'];
        $provincias    = json_decode(file_get_contents($path . '2_ubigeo_provincias.json'), true)['ubigeo_provincias'];
        $distritos     = json_decode(file_get_contents($path . '3_ubigeo_distritos.json'), true)['ubigeo_distritos'];

        DB::transaction(function () use ($departamentos, $provincias, $distritos) {
            foreach (array_chunk($departamentos, 500) as $chunk) {
                DB::table('ubigeo_departamentos')->insert(array_map(fn($d) => [
                    'id'           => $d['id'],
                    'departamento' => $d['departamento'],
                    'ubigeo'       => $d['ubigeo'],
                    'created_at'   => now(),
                    'updated_at'   => now(),
                ], $chunk));
            }

            foreach (array_chunk($provincias, 500) as $chunk) {
                DB::table('ubigeo_provincias')->insert(array_map(fn($p) => [
                    'id'              => $p['id'],
                    'provincia'       => $p['provincia'],
                    'ubigeo'          => $p['ubigeo'],
                    'departamento_id' => $p['departamento_id'],
                    'created_at'      => now(),
                    'updated_at'      => now(),
                ], $chunk));
            }

            foreach (array_chunk($distritos, 500) as $chunk) {
                DB::table('ubigeo_distritos')->insert(array_map(fn($d) => [
                    'id'              => $d['id'],
                    'distrito'        => $d['distrito'],
                    'ubigeo'          => $d['ubigeo'],
                    'provincia_id'    => $d['provincia_id'],
                    'departamento_id' => $d['departamento_id'],
                    'created_at'      => now(),
                    'updated_at'      => now(),
                ], $chunk));
            }
        });

        $this->command->info('Ubigeos cargados: ' . count($departamentos) . ' departamentos, '
            . count($provincias) . ' provincias, ' . count($distritos) . ' distritos.');
    }
}
