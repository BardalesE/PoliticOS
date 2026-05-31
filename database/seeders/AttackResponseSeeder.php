<?php

namespace Database\Seeders;

use App\Models\AttackResponse;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Cache;

/**
 * Plantillas de respuesta a ataques comunes en política peruana.
 *
 * IMPORTANTE: Estas son ESTRATEGIAS GENÉRICAS de respuesta. Cada candidato
 * debe personalizarlas desde el admin antes de lanzar producción.
 *
 * El campo response_template son INSTRUCCIONES para la IA, no texto literal
 * que se enviará al usuario. La IA leerá la instrucción, la combinará con
 * el plan de gobierno (RAG) y generará una respuesta natural.
 */
class AttackResponseSeeder extends Seeder
{
    public function run(): void
    {
        $items = [
            // ─── Categoría: PASADO POLÍTICO ──────────────────────────
            [
                'attack_keyword' => 'corrupcion',
                'synonyms' => ['corrupto','coima','soborno','sobornos'],
                'attack_category' => 'pasado',
                'response_template' => 'Reconoce que la corrupción es la principal preocupación del peruano. NO te pongas a la defensiva. Afirma compromiso con transparencia (declaración jurada pública, contratos abiertos, controles ciudadanos). Redirige a propuestas concretas de lucha anticorrupción.',
                'deflection_topic' => 'seguridad',
                'priority' => 90,
            ],
            [
                'attack_keyword' => 'fracaso',
                'synonyms' => ['fracasaste','no ganaste','perdiste','quedaste segundo'],
                'attack_category' => 'pasado',
                'response_template' => 'Reconoce el resultado con humildad. Habla de las lecciones aprendidas. Enfatiza qué hizo diferente esta vez. Cierra con propuesta concreta del futuro, no del pasado.',
                'deflection_topic' => null,
                'priority' => 70,
            ],
            [
                'attack_keyword' => 'mentiras',
                'synonyms' => ['mentiroso','mentira','mientes','engañas','demagogia'],
                'attack_category' => 'pasado',
                'response_template' => 'No te defiendas atacando. Responde con datos verificables y fuentes públicas. Invita al ciudadano a leer el plan de gobierno completo (PDF). Sé específico con cifras y plazos.',
                'deflection_topic' => null,
                'priority' => 80,
            ],
            // ─── Categoría: PARTIDO ──────────────────────────────────
            [
                'attack_keyword' => 'fujimorismo',
                'synonyms' => ['fujimorista','fuji','fuerza popular','dictadura'],
                'attack_category' => 'partido',
                'response_template' => 'Si tu candidato es de FP: reconoce la legitimidad de la crítica histórica, pero diferencia el partido actual de los errores del pasado. Si tu candidato es de OTRO partido: no entres a atacar; di que respetas el voto democrático y enfocas en tus propuestas. NUNCA insultes a Keiko ni a Alberto por nombre.',
                'deflection_topic' => null,
                'priority' => 95,
            ],
            [
                'attack_keyword' => 'caviar',
                'synonyms' => ['caviares','izquierda caviar','progre'],
                'attack_category' => 'partido',
                'response_template' => 'No tomes el insulto como tal. Pregunta qué le preocupa específicamente al ciudadano sobre las propuestas. Responde con datos. Mantén respeto independiente del tono del votante.',
                'deflection_topic' => null,
                'priority' => 60,
            ],
            [
                'attack_keyword' => 'comunista',
                'synonyms' => ['comunismo','chavista','venezuela','cuba'],
                'attack_category' => 'partido',
                'response_template' => 'Diferencia con claridad: mi propuesta es {{candidate_first}}, no un modelo importado. Reafirma economía de mercado social, propiedad privada, libertad. Redirige a propuestas concretas de empleo.',
                'deflection_topic' => 'economia',
                'priority' => 85,
            ],
            // ─── Categoría: PERSONAL ─────────────────────────────────
            [
                'attack_keyword' => 'edad',
                'synonyms' => ['muy joven','muy viejo','demasiado mayor','sin experiencia'],
                'attack_category' => 'personal',
                'response_template' => 'Convierte la "debilidad" en fortaleza. Si joven: energía, conexión con nueva generación, frescura. Si mayor: experiencia, conocer el Estado por dentro. Cita logros específicos como respaldo.',
                'deflection_topic' => null,
                'priority' => 50,
            ],
            [
                'attack_keyword' => 'sin preparacion',
                'synonyms' => ['no estudiaste','sin estudios','ignorante','poco preparado'],
                'attack_category' => 'personal',
                'response_template' => 'Reconoce que la preparación importa Y que la conexión con el pueblo también. Menciona equipo técnico que respalda decisiones. Habla de experiencia práctica > títulos.',
                'deflection_topic' => null,
                'priority' => 55,
            ],
            // ─── Categoría: PROPUESTAS ───────────────────────────────
            [
                'attack_keyword' => 'imposible',
                'synonyms' => ['no se puede','utopia','utopía','populismo','demagogia'],
                'attack_category' => 'propuesta',
                'response_template' => 'Pregunta cuál propuesta específicamente le preocupa. Responde con presupuesto, plazos, fuente de financiamiento. Si no tienes el detalle, di que está en el plan y darás respuesta concreta. NUNCA prometas algo sin cifras.',
                'deflection_topic' => null,
                'priority' => 65,
            ],
            [
                'attack_keyword' => 'va a subir impuestos',
                'synonyms' => ['más impuestos','aumentar impuestos','quitarme dinero'],
                'attack_category' => 'propuesta',
                'response_template' => 'Aclara con cifras concretas qué tributos cambian y cuáles NO. Diferencia formalización (ampliar base) de aumentar tasas. Da ejemplos de quién se beneficia (clases medias, MYPES).',
                'deflection_topic' => 'economia',
                'priority' => 75,
            ],
            // ─── Categoría: RIVAL ────────────────────────────────────
            [
                'attack_keyword' => 'mejor que el otro',
                'synonyms' => ['comparalo con','que opinas de tu rival'],
                'attack_category' => 'rival',
                'response_template' => 'NUNCA insultes ni descalifiques al rival por nombre. Reconoce que el ciudadano debe escuchar a ambos. Diferencia con HECHOS de TU plan, no con ataques. Termina con: "la mejor decisión es la informada — léeme el plan completo".',
                'deflection_topic' => null,
                'priority' => 88,
            ],
            // ─── Genéricos ───────────────────────────────────────────
            [
                'attack_keyword' => 'no voy a votar',
                'synonyms' => ['voto blanco','voto viciado','no creo en nadie'],
                'attack_category' => 'otro',
                'response_template' => 'Respeta la postura. Reconoce la frustración como legítima. No pidas el voto. Ofrece información para que decida con datos. Cierra con: "vota o no vota, ya tienes un poco más de información para conversar con tu familia".',
                'deflection_topic' => null,
                'priority' => 70,
            ],
        ];

        foreach ($items as $item) {
            AttackResponse::updateOrCreate(
                ['attack_keyword' => $item['attack_keyword']],
                array_merge($item, ['is_active' => true])
            );
        }

        Cache::forget('attack_responses_map');
    }
}
