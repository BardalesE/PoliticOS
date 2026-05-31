<?php

namespace Database\Seeders;

use App\Models\Topic;
use Illuminate\Database\Seeder;

class TopicSeederV2 extends Seeder
{
    public function run(): void
    {
        $topics = [
            ['name' => 'seguridad',   'label' => 'Seguridad Ciudadana', 'keywords' => ['inseguridad','delincuencia','sicarios','asaltos','asaltó','serenazgo','policía','crimen','asesinato','extorsión','marcas','cogoteo','robar','robaron','robo','asaltan','pandillas','peligro','miedo','víctima','víctimas']],
            ['name' => 'economia',    'label' => 'Economía y Empleo',   'keywords' => ['empleo','trabajo','sin empleo','desempleo','sueldo','salario','impuesto','impuestos','MYPE','MYPES','formalización','inversión','crecimiento','inflación','precios','sol','dólar','negocio','emprender','empresa']],
            ['name' => 'salud',       'label' => 'Salud',               'keywords' => ['hospital','hospitales','medicina','medicamento','medicamentos','enfermo','SIS','EsSalud','MINSA','posta','médico','médicos','enfermería','operación','cáncer','diabetes']],
            ['name' => 'educacion',   'label' => 'Educación',           'keywords' => ['colegio','colegios','escuela','escuelas','universidad','universidades','beca','becas','profesor','profesores','maestro','estudiante','estudiantes','SUNEDU','PRONABEC','educación pública']],
            ['name' => 'agua',        'label' => 'Agua y Saneamiento',  'keywords' => ['agua','desagüe','alcantarillado','potable','SEDAPAL','sin agua','escasez','río','río contaminado']],
            ['name' => 'transporte',  'label' => 'Transporte',          'keywords' => ['transporte','tráfico','combi','custer','metro','tren','metropolitano','corredor','peaje','peajes','pista','pistas','carretera','carreteras','asfaltado']],
            ['name' => 'vivienda',    'label' => 'Vivienda',            'keywords' => ['vivienda','casa','techo propio','MiVivienda','crédito hipotecario','invasión','asentamiento','pueblo joven']],
            ['name' => 'mineria',     'label' => 'Minería',             'keywords' => ['minería','minera','mineros','conga','tía maría','las bambas','mining','canon','regalías','contaminación minera']],
            ['name' => 'agricultura', 'label' => 'Agricultura',         'keywords' => ['agricultor','agricultura','agro','chacra','sembrar','cosecha','fertilizante','urea','agua de riego','agroexportación','agroexportador']],
            ['name' => 'corrupcion',  'label' => 'Anticorrupción',      'keywords' => ['corrupto','corrupción','coima','soborno','lava jato','odebrecht','transparencia','procuraduría','contraloría']],
            ['name' => 'congreso',    'label' => 'Política',            'keywords' => ['congreso','congresista','congresistas','parlamento','disolución','vacancia','reforma política']],
            ['name' => 'narcotrafico','label' => 'Narcotráfico',        'keywords' => ['narcotráfico','droga','cocaína','VRAEM','sendero','terrorismo','Shining Path']],
            ['name' => 'pension',     'label' => 'Pensiones',           'keywords' => ['pensión','pensiones','AFP','ONP','jubilación','jubilado','adulto mayor','aporte']],
            ['name' => 'tecnologia',  'label' => 'Tecnología',          'keywords' => ['internet','digitalización','IA','inteligencia artificial','tecnología','digital','tramite virtual','tramite']],
            ['name' => 'juventud',    'label' => 'Juventud',            'keywords' => ['joven','jóvenes','juventud','primer empleo','egresado','recién egresado','tiktok','redes sociales']],
            ['name' => 'mujer',       'label' => 'Mujer',               'keywords' => ['mujer','mujeres','feminicidio','violencia familiar','violencia de género','maternidad','licencia']],
        ];

        foreach ($topics as $t) {
            Topic::updateOrCreate(
                ['name' => $t['name']],
                ['label' => $t['label'], 'keywords' => $t['keywords'], 'is_active' => true]
            );
        }
    }
}
