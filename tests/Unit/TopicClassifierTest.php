<?php

namespace Tests\Unit;

use App\Services\TopicClassifier;
use PHPUnit\Framework\TestCase;

/**
 * Núcleo puro del clasificador de temas del panel (sin BD).
 * Regresión del "75 % general": subcadenas, tildes, empates, alias de la IA.
 */
class TopicClassifierTest extends TestCase
{
    private const MAP = [
        'seguridad'   => ['seguridad', 'robo', 'extorsion', 'serenazgo'],
        'economia'    => ['empleo', 'trabajo', 'sol'],
        'agricultura' => ['agricultura', 'chacra', 'riego', 'canal de riego'],
        'tecnologia'  => ['ia', 'internet'],
        'educacion'   => ['educacion', 'colegio'],
    ];

    public function test_clasifica_por_palabra_completa_no_por_subcadena(): void
    {
        // "ia" (Tecnología) no debe matchear "historia"; "sol" no debe matchear "solución".
        $this->assertNull(TopicClassifier::classifyWith(self::MAP, 'Cuéntame su historia y la solución'));
        $this->assertSame('tecnologia', TopicClassifier::classifyWith(self::MAP, '¿Usará IA en la municipalidad?'));
    }

    public function test_ignora_tildes_y_mayusculas(): void
    {
        $this->assertSame('seguridad', TopicClassifier::classifyWith(self::MAP, '¿QUÉ HARÁ CONTRA LA EXTORSIÓN?'));
        $this->assertSame('educacion', TopicClassifier::classifyWith(self::MAP, 'propuestas de educación'));
    }

    public function test_gana_el_tema_con_mas_evidencia_no_el_primero(): void
    {
        // "seguridad" va primero en el mapa, pero hay más señales de agricultura.
        $msg = 'Sin seguridad no hay nada, pero ¿qué hará con el canal de riego de mi chacra?';
        $this->assertSame('agricultura', TopicClassifier::classifyWith(self::MAP, $msg));
    }

    public function test_en_empate_gana_el_orden_del_admin(): void
    {
        $this->assertSame('seguridad', TopicClassifier::classifyWith(self::MAP, 'robo y trabajo'));
    }

    public function test_sin_evidencia_devuelve_null(): void
    {
        $this->assertNull(TopicClassifier::classifyWith(self::MAP, 'hola'));
        $this->assertNull(TopicClassifier::classifyWith(self::MAP, ''));
    }

    public function test_tema_de_la_ia_solo_si_existe_en_el_tenant(): void
    {
        $c = new TopicClassifier();
        $topics = array_keys(self::MAP);

        $this->assertNull($c->resolveAiTopic('otro', $topics));
        $this->assertNull($c->resolveAiTopic('general', $topics));
        $this->assertNull($c->resolveAiTopic(null, $topics));
        $this->assertNull($c->resolveAiTopic('mineria', $topics));             // no existe en el tenant
        $this->assertSame('economia', $c->resolveAiTopic('empleo', $topics));   // alias
        $this->assertSame('seguridad', $c->resolveAiTopic('Seguridad', $topics));
    }

    public function test_normaliza_puntuacion_y_espacios(): void
    {
        $this->assertSame('que hara con el agua', TopicClassifier::normalize('  ¿Qué  hará con el agua?! '));
    }

    public function test_preguntas_sobre_el_candidato_van_a_su_propia_categoria(): void
    {
        $c = new TopicClassifier();
        $this->assertSame(TopicClassifier::PERFIL, $c->classifyUsing(self::MAP, '¿Quién es el candidato?'));
        $this->assertSame(TopicClassifier::PERFIL, $c->classifyUsing(self::MAP, 'muéstrame su hoja de vida'));
        // Si además menciona un tema, gana el tema.
        $this->assertSame('seguridad', $c->classifyUsing(self::MAP, '¿Qué experiencia tiene en seguridad?'));
    }

    public function test_pregunta_corta_de_seguimiento_hereda_el_tema_anterior(): void
    {
        $c = new TopicClassifier();
        $this->assertSame('agricultura', $c->classifyUsing(self::MAP, '¿y cuánto costaría eso?', null, 'agricultura'));
        // Cortesías no heredan.
        $this->assertNull($c->classifyUsing(self::MAP, '¡Gracias!', null, 'agricultura'));
        // Mensajes largos sin tema no heredan.
        $this->assertNull($c->classifyUsing(self::MAP, 'me gustaría saber más cosas en general sobre todo lo que piensa hacer', null, 'agricultura'));
    }

    public function test_usa_el_tema_de_la_ia_cuando_las_keywords_no_alcanzan(): void
    {
        $c = new TopicClassifier();
        $this->assertSame('economia', $c->classifyUsing(self::MAP, '¿Cómo reactivará la ciudad?', 'empleo'));
        $this->assertNull($c->classifyUsing(self::MAP, '¿Cómo reactivará la ciudad?', 'otro'));
    }
}
