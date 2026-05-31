<?php

namespace Database\Seeders;

use App\Models\Faq;
use Illuminate\Database\Seeder;

class FaqSeeder extends Seeder
{
    public function run(): void
    {
        $faqs = [
            // ─── IDENTIDAD ────────────────────────────────────────
            [
                'question' => '¿Quién es Rigo?',
                'answer'   => 'Soy un vecino de San Gregorio que conoce de cerca la realidad de nuestros caseríos porque siempre he caminado junto a la gente. Cuando fui alcalde trabajamos con obras reales: carreteras, agua potable, lozas deportivas y apoyo al agricultor. A mí me gusta hablar claro y cumplir con hechos, porque la política no se hace desde un escritorio, se hace escuchando al pueblo y trabajando al lado de la población.',
                'topic'    => null,
                'priority' => 1,
            ],
            [
                'question' => '¿Por qué quieres ser alcalde?',
                'answer'   => 'Porque San Miguel merece más. He visto cómo nuestros caseríos siguen sin agua, sin pistas, sin oportunidades para los jóvenes. No quiero hacer política para enriquecerme. Quiero gestionar la provincia como se gestiona una familia: con orden, transparencia y mirando siempre por los que menos tienen.',
                'topic'    => null,
                'priority' => 1,
            ],
           
            [
                'question' => '¿Qué te diferencia de otros candidatos?',
                'answer'   => 'Yo soy de aquí. No vengo a prometer cosas imposibles para ganar votos. Cada propuesta que hago tiene presupuesto, plazo y responsable. Y algo más: con esta plataforma, cualquier vecino puede preguntarme lo que quiera y revisar después si cumplí o no. Eso es transparencia de verdad.',
                'topic'    => null,
                'priority' => 2,
            ],

           
            [
                'question' => '¿Cuándo llegará el agua a mi caserío?',
                'answer'   => 'Depende del distrito, pero el plan es que en el primer año tengamos avances visibles en al menos 3 distritos. Si me ganas la confianza con tu voto en octubre, el primer trimestre del 2027 ya tenemos las obras priorizadas y con presupuesto comprometido.',
                'topic'    => 'agua',
                'priority' => 2,
            ],

            // ─── AGRICULTURA ──────────────────────────────────────
            [
                'question' => '¿Qué harás por la agricultura?',
                'answer'   => 'El agricultor necesita apoyo real, no solo palabras. Mi propuesta es fortalecer el campo con mejores canales y reservorios de agua, apoyo técnico, mantenimiento de vías para sacar productos y proyectos que ayuden a vender mejor las cosechas. En San Gregorio muchas familias viven de la chacra y por eso el agro tiene que ser una prioridad, porque cuando al campesino le va bien, le va bien a todo el distrito.',
                'topic'    => 'agricultura',
                'priority' => 1,
            ],
            [
                'question' => '¿Vas a apoyar la papa nativa?',
                'answer'   => 'Por supuesto. La papa nativa es nuestra identidad. Trabajaremos con SENASA para certificar semillas, y con universidades para mejorar técnicas de cultivo. Y lo más importante: buscar mercado en Chiclayo, Trujillo y Lima para que el productor reciba un precio justo.',
                'topic'    => 'agricultura',
                'priority' => 2,
            ],

            // ─── VÍAS ─────────────────────────────────────────────
            [
                'question' => '¿Qué obras harás en pistas y carreteras?',
                'answer'   => 'Tres obras grandes en los primeros 18 meses: la trocha San Miguel-Calquis (14 km de afirmado), el asfaltado del jirón principal de Pallaques (1.2 km) y el puente vehicular de El Prado. En total más de 2 millones de soles en infraestructura vial.',
                'topic'    => 'vias',
                'priority' => 1,
            ],

            // ─── SALUD ────────────────────────────────────────────
            [
                'question' => '¿Qué harás por la salud?',
                'answer'   => 'Equipar las postas de 6 distritos con lo básico: balanzas, camillas, medicamentos. Y conseguir una ambulancia 4x4 para emergencias rurales. La salud no puede esperar a que el paciente baje a Pallaques 3 horas en moto.',
                'topic'    => 'salud',
                'priority' => 1,
            ],

            // ─── EDUCACIÓN ────────────────────────────────────────
            [
                'question' => '¿Qué harás por la educación?',
                'answer'   => 'Llevar internet a 3 colegios rurales. Crear un programa de becas para que los chicos que ingresen a universidad nacional no se queden por falta de plata. La educación es lo único que nos saca adelante como distrito.',
                'topic'    => 'educacion',
                'priority' => 1,
            ],

            // ─── SEGURIDAD ────────────────────────────────────────
            [
                'question' => '¿Qué harás por la seguridad?',
                'answer'   => 'Fortalecer a las rondas campesinas, que son nuestros guardianes de toda la vida. Apoyo con linternas, radios, ponchos. Coordinación con la PNP. Y en Pallaques, cámaras de seguridad en puntos críticos.',
                'topic'    => 'seguridad',
                'priority' => 1,
            ],

            // ─── GESTIÓN ──────────────────────────────────────────
            [
                'question' => '¿Cómo vas a controlar la corrupción?',
                'answer'   => 'Con transparencia total. Cada sol que entre a la municipalidad estará publicado en la web — esta misma plataforma. Cada obra con su presupuesto, su avance, su responsable y sus fotos en tiempo real. Si el vecino ve algo raro, lo denuncia y se investiga. Sin protección a nadie.',
                'topic'    => null,
                'priority' => 1,
            ],
            [
                'question' => '¿Qué pasa si ganas las elecciones?',
                'answer'   => 'Lo primero: el día 1 te muestro mi declaración jurada de bienes. Lo segundo: en 30 días tendremos publicado el plan operativo del año con todas las obras priorizadas. Y esta plataforma sigue funcionando — para que me preguntes lo que quieras y veas si estoy cumpliendo o no.',
                'topic'    => null,
                'priority' => 2,
            ],
        ];

        foreach ($faqs as $f) Faq::create($f);
    }
}
