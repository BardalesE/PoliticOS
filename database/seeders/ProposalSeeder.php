<?php

namespace Database\Seeders;

use App\Models\Proposal;
use Illuminate\Database\Seeder;

class ProposalSeeder extends Seeder
{
    public function run(): void
    {
        $proposals = [
            // // ─── AGUA ─────────────────────────────────────────────
            // [
            //     'title'       => 'Ampliación de red de agua potable en Niepos',
            //     'description' => 'Llevar agua potable a los sectores Huayrapongo y La Laguna en Niepos. Beneficiará a más de 600 familias que hoy cargan agua del río.',
            //     'district'    => 'Niepos',
            //     'topic'       => 'agua',
            //     'budget'      => 280000,
            //     'priority'    => 1,
            //     'status'      => 'propuesta',
            // ],
            // [
            //     'title'       => 'Sistema de agua para zonas altas de Calquis',
            //     'description' => 'Instalación de tanques elevados y red de distribución para los caseríos altos de Calquis. Agua segura todo el año.',
            //     'district'    => 'Calquis',
            //     'topic'       => 'agua',
            //     'budget'      => 195000,
            //     'priority'    => 2,
            //     'status'      => 'propuesta',
            // ],
            // [
            //     'title'       => 'Mantenimiento integral de redes de agua en San Gregorio',
            //     'description' => 'Reparación de tuberías antiguas en la capital distrital. Reducir pérdidas y mejorar presión en zonas altas.',
            //     'district'    => 'San Gregorio',
            //     'topic'       => 'agua',
            //     'budget'      => 150000,
            //     'priority'    => 1,
            //     'status'      => 'propuesta',
            // ],

            // // ─── AGRICULTURA ──────────────────────────────────────
            // [
            //     'title'       => 'Centro de acopio agrícola provincial',
            //     'description' => 'Construcción de centro de acopio para que el agricultor venda directo, sin intermediarios. Más ganancia para el productor.',
            //     'district'    => 'San Gregorio',
            //     'topic'       => 'agricultura',
            //     'budget'      => 420000,
            //     'priority'    => 1,
            //     'status'      => 'propuesta',
            // ],
            // [
            //     'title'       => 'Capacitación técnica para agricultores',
            //     'description' => 'Programa anual de capacitación en cultivos andinos: papa nativa, quinua, tarwi. Convenio con SENASA y universidades.',
            //     'district'    => null,
            //     'topic'       => 'agricultura',
            //     'budget'      => 85000,
            //     'priority'    => 3,
            //     'status'      => 'propuesta',
            // ],
            // [
            //     'title'       => 'Reservorios para riego en Llapa',
            //     'description' => 'Construcción de 4 reservorios pequeños para almacenar agua de lluvia y regar en época seca.',
            //     'district'    => 'Llapa',
            //     'topic'       => 'agricultura',
            //     'budget'      => 320000,
            //     'priority'    => 2,
            //     'status'      => 'propuesta',
            // ],

            // // ─── VÍAS ─────────────────────────────────────────────
            // [
            //     'title'       => 'Mejoramiento de trocha San Miguel - Calquis',
            //     'description' => 'Afirmado y ampliación de 14 km de trocha. Conecta a 8 caseríos que hoy quedan aislados en invierno.',
            //     'district'    => 'Calquis',
            //     'topic'       => 'vias',
            //     'budget'      => 680000,
            //     'priority'    => 1,
            //     'status'      => 'propuesta',
            // ],
            // [
            //     'title'       => 'Asfaltado del jirón principal de Pallaques',
            //     'description' => 'Pavimentación de 1.2 km del jirón Bolognesi en la capital provincial. Veredas y drenaje pluvial incluidos.',
            //     'district'    => 'San Gregorio',
            //     'topic'       => 'vias',
            //     'budget'      => 850000,
            //     'priority'    => 2,
            //     'status'      => 'propuesta',
            // ],
        
            // // ─── SALUD ────────────────────────────────────────────
            // [
            //     'title'       => 'Equipamiento de postas médicas en 6 distritos',
            //     'description' => 'Camillas, balanzas, equipos de presión y medicamentos básicos para postas de Catilluc, Nanchoc, San Gregorio, Cochán, Tongod y Agua Blanca.',
            //     'district'    => null,
            //     'topic'       => 'salud',
            //     'budget'      => 240000,
            //     'priority'    => 1,
            //     'status'      => 'propuesta',
            // ],
            // [
            //     'title'       => 'Ambulancia rural para San Miguel',
            //     'description' => 'Una ambulancia 4x4 para emergencias en zonas alejadas. Operativa 24/7 con personal capacitado.',
            //     'district'    => 'San Miguel de Pallaques',
            //     'topic'       => 'salud',
            //     'budget'      => 380000,
            //     'priority'    => 1,
            //     'status'      => 'propuesta',
            // ],

            // // ─── EDUCACIÓN ────────────────────────────────────────
            // [
            //     'title'       => 'Conectividad escolar — internet en 20 colegios rurales',
            //     'description' => 'Instalación de internet satelital en 20 colegios de zonas altas. Acceso a contenido educativo digital.',
            //     'district'    => null,
            //     'topic'       => 'educacion',
            //     'budget'      => 290000,
            //     'priority'    => 2,
            //     'status'      => 'propuesta',
            // ],
            // [
            //     'title'       => 'Becas para estudiantes destacados',
            //     'description' => 'Programa anual de 30 becas para estudiantes que ingresan a universidad nacional. Apoyo en matrícula y materiales.',
            //     'district'    => null,
            //     'topic'       => 'educacion',
            //     'budget'      => 120000,
            //     'priority'    => 3,
            //     'status'      => 'propuesta',
            // ],

            // // ─── SEGURIDAD ────────────────────────────────────────
            // [
            //     'title'       => 'Fortalecimiento de rondas campesinas',
            //     'description' => 'Apoyo logístico a las rondas: linternas, ponchos, radios de comunicación. Trabajo coordinado con la PNP.',
            //     'district'    => null,
            //     'topic'       => 'seguridad',
            //     'budget'      => 95000,
            //     'priority'    => 2,
            //     'status'      => 'propuesta',
            // ],
            // [
            //     'title'       => 'Cámaras de seguridad en Pallaques',
            //     'description' => '12 cámaras en puntos críticos de la capital provincial. Monitoreo desde la municipalidad.',
            //     'district'    => 'San Miguel de Pallaques',
            //     'topic'       => 'seguridad',
            //     'budget'      => 175000,
            //     'priority'    => 3,
            //     'status'      => 'propuesta',
            // ],

            // // ─── EMPLEO ───────────────────────────────────────────
            // [
            //     'title'       => 'Talleres productivos para mujeres',
            //     'description' => 'Programa de capacitación en panadería, costura y artesanía. Apoyo con capital semilla para emprender.',
            //     'district'    => null,
            //     'topic'       => 'empleo',
            //     'budget'      => 145000,
            //     'priority'    => 2,
            //     'status'      => 'propuesta',
            // ],

            // // ─── TURISMO ──────────────────────────────────────────
            // [
            //     'title'       => 'Ruta turística San Miguel — Catarata El Saltón',
            //     'description' => 'Señalización, miradores y senderos hacia la catarata. Capacitación a guías locales.',
            //     'district'    => 'San Miguel de Pallaques',
            //     'topic'       => 'turismo',
            //     'budget'      => 130000,
            //     'priority'    => 3,
            //     'status'      => 'propuesta',
            // ],
        ];

        foreach ($proposals as $p) Proposal::create($p);
    }
}
