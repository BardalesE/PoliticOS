<?php

namespace Tests\Unit;

use App\Jobs\AnalyzeMessageJob;
use ReflectionClass;
use Tests\TestCase;

/**
 * Fase 3 (analytics preciso): AnalyzeMessageJob usaba str_contains() sobre
 * el texto crudo, sin límite de palabra ni manejo de negación — "también"
 * (contiene "bien" como substring) sumaba sentimiento positivo, "no es
 * bueno" también sumaba positivo, y "aguantar" activaba el concern "agua".
 * Ver informe de QA. Pruebas vía reflexión: son métodos privados y puramente
 * textuales (sin DB ni red).
 */
class AnalyzeMessageJobSentimentTest extends TestCase
{
    private function job(): AnalyzeMessageJob
    {
        return new AnalyzeMessageJob(1);
    }

    private function invokePrivate(string $method, ...$args)
    {
        $job = $this->job();
        $ref = new ReflectionClass($job);
        $m = $ref->getMethod($method);
        $m->setAccessible(true);

        return $m->invoke($job, ...$args);
    }

    public function test_negacion_invierte_el_sentimiento(): void
    {
        $this->assertLessThan(0, $this->invokePrivate('scoreSentiment', mb_strtolower('no es bueno')));
        $this->assertGreaterThan(0, $this->invokePrivate('scoreSentiment', mb_strtolower('es bueno')));
    }

    public function test_no_matchea_palabra_dentro_de_otra_palabra(): void
    {
        // "también" contiene "bien" como substring literal — sin límite de
        // palabra, esto sumaba sentimiento positivo por error.
        $this->assertSame(0.0, $this->invokePrivate('scoreSentiment', mb_strtolower('también vengo a preguntar algo')));
    }

    public function test_detect_concerns_no_matchea_substring(): void
    {
        // "aguantar" contiene "agua" como substring literal.
        $this->assertSame([], $this->invokePrivate('detectConcerns', mb_strtolower('hay que aguantar la situación')));
        // Pero "agua" como palabra completa sí debe matchear.
        $this->assertContains('agua', $this->invokePrivate('detectConcerns', mb_strtolower('no hay agua potable aquí')));
    }

    public function test_is_attack_distingue_preocupacion_general_de_acusacion(): void
    {
        $general = mb_strtolower('me preocupa la corrupción en el país');
        $directa = mb_strtolower('el candidato es un corrupto');

        $this->assertFalse($this->invokePrivate('isAttack', $general, $this->invokePrivate('detectIntent', $general)));
        $this->assertTrue($this->invokePrivate('isAttack', $directa, $this->invokePrivate('detectIntent', $directa)));
    }
}
