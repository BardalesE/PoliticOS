<?php

namespace Tests\Unit;

use App\Services\MySQLFulltextEmbeddings;
use ReflectionMethod;
use Tests\TestCase;

/**
 * extractExcerpt() elegía el fragmento de la PRIMERA palabra de la consulta
 * que apareciera en el documento — casi siempre la portada/intro, sin
 * relación con la pregunta real (ver informe de QA, "chatbot preciso").
 * Ahora puntúa por cobertura de palabras distintas de la consulta dentro de
 * la ventana candidata. Se prueba vía reflexión: es un método privado y
 * puramente textual (sin DB ni red).
 */
class MySQLFulltextExcerptTest extends TestCase
{
    private function extract(string $content, string $query, int $windowSize = 1200, string $title = ''): string
    {
        $service = new MySQLFulltextEmbeddings();
        $method  = new ReflectionMethod($service, 'extractExcerpt');
        $method->setAccessible(true);

        return $method->invoke($service, $content, $query, $windowSize, $title);
    }

    public function test_elige_la_ventana_con_mas_cobertura_no_la_primera_coincidencia(): void
    {
        // "propuesta" aparece temprano y es poco informativa por sí sola.
        // "agua" y "potable" — lo que realmente pregunta el ciudadano —
        // aparecen juntas mucho más adelante en el documento.
        $content = str_repeat('Este es el plan de gobierno con propuesta general para el distrito. ', 6)
            . 'Nuestra propuesta de agua potable para el distrito incluye tanques elevados y redes nuevas.'
            . str_repeat(' Texto de relleno sin relación con la pregunta. ', 15);

        $excerpt = $this->extract($content, '¿cuál es tu propuesta de agua potable?', 220);

        $this->assertStringContainsString('agua potable', $excerpt);
    }

    public function test_ignora_stopwords_en_espanol_al_elegir_la_ventana(): void
    {
        // Sin la lista de stopwords, "para" (aparece muy temprano y muchas
        // veces) ganaría la ventana sobre "seguridad" (la palabra que
        // realmente importa de la pregunta).
        $content = 'Para todos, para siempre, para el pueblo. '
            . str_repeat('Para nada relevante. ', 10)
            . 'Nuestro plan de seguridad ciudadana incluye más serenazgo y cámaras.';

        $excerpt = $this->extract($content, '¿qué propones para la seguridad?', 150);

        $this->assertStringContainsString('seguridad ciudadana', $excerpt);
    }

    public function test_sin_coincidencias_devuelve_el_inicio_del_documento(): void
    {
        $content = 'Contenido que no menciona ninguna palabra de la consulta en absoluto.';

        $this->assertSame(
            mb_substr($content, 0, 40),
            $this->extract($content, 'xyz123 abcxyz999', 40)
        );
    }

    public function test_contenido_vacio_devuelve_cadena_vacia(): void
    {
        $this->assertSame('', $this->extract('', 'agua potable'));
    }
    /**
     * Caso real (plan de gobierno de San Gregorio): "Gregorio" y el nombre del
     * candidato aparecen en la portada y por todo el documento; la palabra
     * "agricultura" casi no aparece — el plan habla de "actividad agropecuaria",
     * "canal de riego" y "productores". Ganaba la portada y la IA respondía
     * "no hay nada sobre agricultura".
     */
    private function planSanGregorio(): string
    {
        return 'SAN GREGORIO 2027 - 2030 RIGOBERTO SÁNCHEZ ALVITEZ Candidato al Gobierno Municipal Distrital de San Gregorio. '
            . 'Presentación: el plan de gobierno de San Gregorio, de Rigoberto Sánchez, propone desarrollo humano en San Gregorio. '
            . str_repeat('Relleno general del distrito de San Gregorio sin tema concreto. ', 25)
            . 'Actividad agropecuaria: falta de aprovechamiento del canal de riego Agua Blanca. Ejecutar el canal de riego. '
            . 'Número de productores agrícolas y pecuarios beneficiados con reservorios y riego tecnificado. '
            . str_repeat('Más relleno del distrito de San Gregorio sin tema concreto. ', 25)
            . 'Salud: gestionar la creación de la posta de salud San José y la posta El Sauce.';
    }

    public function test_pregunta_con_nombre_y_lugar_no_se_queda_con_la_portada(): void
    {
        $title = 'Plan de gobierno Rigoberto Sanchez Alvites';

        $excerpt = $this->extract(
            $this->planSanGregorio(),
            '¿Qué propone Rigoberto Sánchez sobre agricultura en San Gregorio?',
            600,
            $title
        );

        $this->assertStringContainsString('canal de riego', $excerpt);
        $this->assertStringNotContainsString('Presentación', $excerpt);
    }

    public function test_expande_el_tema_a_su_vocabulario_sin_tildes(): void
    {
        $excerpt = $this->extract($this->planSanGregorio(), '¿Y qué hará por la salud?', 300, 'Plan de gobierno Rigoberto Sanchez Alvites');

        $this->assertStringContainsString('posta de salud', $excerpt);
    }
}
