<?php

namespace Database\Seeders;

use App\Models\CandidateProfile;
use App\Models\Event;
use App\Models\CampaignPhoto;
use App\Models\CampaignVideo;
use App\Models\District;
use App\Models\HeroSetting;
use App\Models\KnowledgeDocument;
use App\Models\Proposal;
use App\Models\TeamMember;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * Datos de un candidato 100% ficticio ("Marisol Quiñones Castro", distrito
 * inventado "Valle Hermoso") para probar visualmente todo lo construido en
 * julio 2026 sin tocar el tenant real `rigo`: Hero, StatsBar, DosVias,
 * ConcernsWidget, Galería unificada, Lugares Visitados (con reseña
 * turística), navegación por pestañas y Base del Conocimiento.
 *
 * Correr SOLO contra un tenant nuevo/de prueba, nunca contra `rigo`:
 *   php artisan tenant:provision valle-hermoso "Marisol Quiñones — Valle Hermoso" \
 *     politicos_valle_hermoso admin@valle-hermoso.demo Demo2026!
 *   # con APP_TENANT_SLUG=valle-hermoso en el .env (o export/set inline):
 *   php artisan db:seed --class=Database\\Seeders\\DemoContentSeeder
 *
 * Idempotente: usa updateOrCreate/firstOrCreate, se puede correr más de una vez.
 */
class DemoContentSeeder extends Seeder
{
    public function run(): void
    {
        $this->seedProfile();
        $this->seedHero();
        $this->seedDistricts();
        $this->seedGallery();
        $this->seedVideos();
        $this->seedProposals();
        $this->seedTeam();
        $this->seedEvents();
        $this->seedKnowledge();

        $this->command?->info('DemoContentSeeder: contenido ficticio de Valle Hermoso cargado.');
    }

    private function seedProfile(): void
    {
        CandidateProfile::updateOrCreate(
            ['is_active' => true],
            [
                'name'            => 'Marisol Quiñones Castro',
                'title'           => 'Candidata a la Alcaldía',
                'location'        => 'Valle Hermoso',
                'party'           => 'Unidos por el Progreso',
                'list_number'     => '5',
                'bio'             => 'Ingeniera agrónoma, nacida y criada en Valle Hermoso. Diez años trabajando en cooperativas agrícolas de la zona antes de postular.',
                'tagline'         => 'Un compromiso real con nuestra gente.',
                'election_date'   => '2026-10-04',
                'photo_url'       => 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&q=80',
                'logo_url'        => null,
                'hero_photo_url'  => 'https://images.unsplash.com/photo-1500534623283-312aade485b7?w=1600&q=80',
                'hero_video_url'  => null,
                'color_primary'   => '#2E7D32',
                'color_dark'      => '#1B5E20',
                'color_accent'    => '#C9A84C',
                'tiktok_url'      => null,
                'facebook_url'    => 'https://facebook.com/marisolvallehermoso',
                'instagram_url'   => 'https://instagram.com/marisolvallehermoso',
                'whatsapp_number' => '51987654321',
                'personality_traits' => ['cercana', 'técnica', 'directa'],
                'biography_long'     => 'Marisol creció en el caserío de Loma Verde, dentro de Valle Hermoso. Estudió Ingeniería Agrónoma y volvió a trabajar con las cooperativas de su tierra.',
                'signature_phrases'  => ['Con los pies en la chacra, no en el escritorio.'],
                'forbidden_topics'   => [],
                'priority_topics'    => ['agua', 'agricultura', 'educacion'],
                'target_segments'    => ['agricultores', 'jóvenes', 'madres de familia'],
                'campaign_slogan'        => 'Un compromiso real con nuestra gente.',
                'attack_response_style'  => 'calmada y con datos, nunca personal',
            ]
        );
    }

    private function seedHero(): void
    {
        HeroSetting::updateOrCreate(
            ['is_active' => true],
            [
                'title'      => "Un *cambio* real\npara Valle Hermoso.",
                'subtitle'   => 'Candidata a la Alcaldía · Valle Hermoso',
                'badge_text' => 'Unidos por el Progreso · Lista N°5',
                'video_url'  => null, // sin archivo de video real todavía — cae a image_url
                'image_url'  => 'https://images.unsplash.com/photo-1500534623283-312aade485b7?w=1600&q=80',
                'overlay_opacity' => 0.55,
                'btn1_label' => 'Conocer propuestas',
                'btn1_url'   => '/propuestas',
                'btn2_label' => 'Sobre la candidata',
                'btn2_url'   => '#bio',
                'btn3_label' => null,
                'btn3_url'   => null,
            ]
        );
    }

    private function seedDistricts(): void
    {
        $places = [
            [
                'name' => 'Loma Verde', 'keywords' => ['loma verde'],
                'visited_at' => Carbon::now()->subDays(3), 'event_type' => 'Reunión vecinal',
                'highlight_text' => 'Cuna del tejido en telar de cintura — cada familia conserva la técnica ancestral, transmitida de madres a hijas por generaciones.',
                'highlight_photo_url' => 'https://images.unsplash.com/photo-1523706831452-9a4b284dc243?w=600&q=80',
            ],
            [
                'name' => 'San Benito Alto', 'keywords' => ['san benito', 'san benito alto'],
                'visited_at' => Carbon::now()->subDays(6), 'event_type' => 'Recorrido de mercado',
                'highlight_text' => 'Su mercado dominical reúne productores de 6 caseríos desde hace más de 40 años — el corazón comercial de la zona alta.',
                'highlight_photo_url' => 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=600&q=80',
            ],
            [
                'name' => 'Puquio Grande', 'keywords' => ['puquio grande', 'puquio'],
                'visited_at' => Carbon::now()->subDays(10), 'event_type' => 'Visita al colegio',
                'highlight_text' => 'Nombrado por sus manantiales naturales, todavía usados para el riego de toda la parte baja del valle.',
                'highlight_photo_url' => 'https://images.unsplash.com/photo-1500964757637-c85e8a162699?w=600&q=80',
            ],
            [
                'name' => 'Alto Perú', 'keywords' => ['alto peru', 'alto perú'],
                'visited_at' => Carbon::now()->subDays(14), 'event_type' => 'Asamblea comunal',
                'highlight_text' => null, // deliberado: sin reseña todavía, prueba el degradado sin hueco vacío
                'highlight_photo_url' => null,
            ],
            [
                'name' => 'Rinconada del Sol', 'keywords' => ['rinconada', 'rinconada del sol'],
                'visited_at' => null, 'event_type' => null, // deliberado: sin visitar aún — no debe aparecer en Lugares Visitados
                'highlight_text' => null, 'highlight_photo_url' => null,
            ],
        ];

        foreach ($places as $i => $p) {
            District::updateOrCreate(
                ['name' => $p['name']],
                [
                    'keywords'             => $p['keywords'],
                    'sort_order'           => $i + 1,
                    'is_active'            => true,
                    'visited_at'           => $p['visited_at'],
                    'event_type'           => $p['event_type'],
                    'highlight_text'       => $p['highlight_text'],
                    'highlight_photo_url'  => $p['highlight_photo_url'],
                ]
            );
        }
    }

    private function seedGallery(): void
    {
        $photos = [
            ['title' => 'Reunión vecinal — Loma Verde', 'category' => 'Campaña', 'url' => 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80', 'days_ago' => 3],
            ['title' => 'Recorrido de mercado — San Benito Alto', 'category' => 'Campaña', 'url' => 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=800&q=80', 'days_ago' => 6],
            ['title' => 'Visita al colegio — Puquio Grande', 'category' => 'Educación', 'url' => 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&q=80', 'days_ago' => 10],
            ['title' => 'Asamblea comunal — Alto Perú', 'category' => 'Campaña', 'url' => 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80', 'days_ago' => 14],
            ['title' => 'Canal de riego', 'category' => 'Agua', 'url' => 'https://images.unsplash.com/photo-1500964757637-c85e8a162699?w=800&q=80', 'days_ago' => 18],
        ];

        foreach ($photos as $p) {
            $photo = CampaignPhoto::firstOrCreate(
                ['title' => $p['title']],
                ['url' => $p['url'], 'category' => $p['category']]
            );
            $photo->created_at = Carbon::now()->subDays($p['days_ago']);
            $photo->save();
        }
    }

    private function seedVideos(): void
    {
        $videos = [
            [
                'title' => '"Un compromiso real" — spot oficial',
                'category' => 'Spot oficial',
                'url' => 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                'days_ago' => 1,
            ],
            [
                'title' => 'Recorrido en Puquio Grande',
                'category' => 'Recorrido',
                'url' => 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
                'days_ago' => 10,
            ],
        ];

        foreach ($videos as $v) {
            $video = CampaignVideo::firstOrCreate(
                ['title' => $v['title']],
                ['url' => $v['url'], 'category' => $v['category']]
            );
            $video->created_at = Carbon::now()->subDays($v['days_ago']);
            $video->save();
        }
    }

    private function seedProposals(): void
    {
        $proposals = [
            ['title' => 'Agua potable para Loma Verde y San Benito Alto', 'topic' => 'agua', 'status' => 'en_curso', 'budget' => 850000, 'description' => 'Ampliación de la red de agua potable a los dos caseríos altos, con planta de tratamiento nueva.'],
            ['title' => 'Postas médicas itinerantes', 'topic' => 'salud', 'status' => 'propuesta', 'budget' => 320000, 'description' => 'Una posta móvil que visite cada caserío una vez por semana, con médico y obstetra.'],
            ['title' => 'Internet satelital en 5 colegios rurales', 'topic' => 'educacion', 'status' => 'propuesta', 'budget' => 210000, 'description' => 'Conectividad real para los colegios de la zona alta, hoy sin ningún tipo de acceso.'],
            ['title' => 'Asfaltado del tramo Puquio Grande–Alto Perú', 'topic' => 'transporte', 'status' => 'propuesta', 'budget' => 1200000, 'description' => 'Los 8km que hoy toman 40 minutos en época de lluvias.'],
            ['title' => 'Fondo semilla para asociaciones agrícolas', 'topic' => 'agricultura', 'status' => 'completada', 'budget' => 150000, 'description' => 'Ya entregado a 3 asociaciones de productores de café y cacao.'],
        ];

        foreach ($proposals as $i => $p) {
            Proposal::updateOrCreate(
                ['title' => $p['title']],
                [
                    'description'  => $p['description'],
                    'district'     => null,
                    'topic'        => $p['topic'],
                    'budget'       => $p['budget'],
                    'priority'     => $i + 1,
                    'status'       => $p['status'],
                    'image'        => null,
                    'document_url' => null,
                ]
            );
        }
    }

    private function seedTeam(): void
    {
        $team = [
            ['name' => 'Jorge Ríos Bautista', 'role' => 'Jefe de campaña', 'description' => 'Coordinador de los 5 caseríos de la zona alta.'],
            ['name' => 'Fátima Delgado Ruiz', 'role' => 'Vocera de propuestas', 'description' => 'Encargada de traducir el plan de gobierno a cada asamblea comunal.'],
            ['name' => 'Elmer Castañeda Vidal', 'role' => 'Coordinador de campo', 'description' => 'El que llega primero a cada caserío antes de cada visita.'],
        ];

        foreach ($team as $i => $t) {
            TeamMember::updateOrCreate(
                ['name' => $t['name']],
                [
                    'role'         => $t['role'],
                    'description'  => $t['description'],
                    'photo_url'    => null,
                    'facebook_url' => null,
                    'instagram_url'=> null,
                    'sort_order'   => $i + 1,
                    'is_active'    => true,
                ]
            );
        }
    }

    private function seedEvents(): void
    {
        Event::updateOrCreate(
            ['title' => 'Debate municipal — Valle Hermoso'],
            [
                'description'  => 'Debate abierto entre los 4 candidatos a la alcaldía, transmitido en vivo.',
                'event_date'   => Carbon::now()->addDays(12),
                'location'     => 'Coliseo municipal',
                'address'      => 'Plaza de Armas de Valle Hermoso',
                'image_url'    => 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=800&q=80',
                'stream_url'   => null,
                'is_active'    => true,
                'is_featured'  => true,
                'sort_order'   => 1,
            ]
        );

        Event::updateOrCreate(
            ['title' => 'Asamblea de cierre — Loma Verde'],
            [
                'description' => 'Balance de los primeros 100 días de gobierno propuestos, con la comunidad.',
                'event_date'  => Carbon::now()->subDays(5),
                'location'    => 'Loma Verde',
                'address'     => 'Local comunal',
                'image_url'   => null,
                'stream_url'  => null,
                'is_active'   => true,
                'is_featured' => false,
                'sort_order'  => 2,
            ]
        );
    }

    private function seedKnowledge(): void
    {
        $docs = [
            ['title' => 'Plan de gobierno 2026-2030', 'topic' => 'agua', 'source_type' => 'pdf'],
            ['title' => 'Hoja de vida — Marisol Quiñones Castro', 'topic' => null, 'source_type' => 'pdf'],
        ];

        foreach ($docs as $d) {
            KnowledgeDocument::updateOrCreate(
                ['title' => $d['title']],
                [
                    'description'  => 'Documento de ejemplo para pruebas — reemplazar por el archivo real antes de campaña.',
                    'file_url'     => 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                    'topic'        => $d['topic'],
                    'source_url'   => null,
                    'source_type'  => $d['source_type'],
                    'file_size'    => 13264,
                    'is_active'    => true,
                ]
            );
        }
    }
}
