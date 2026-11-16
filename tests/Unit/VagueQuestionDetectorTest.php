<?php

namespace Tests\Unit;

use App\Services\VagueQuestionDetector;
use Tests\TestCase;

class VagueQuestionDetectorTest extends TestCase
{
    /** @dataProvider vague */
    public function test_detects_vague_questions(string $msg): void
    {
        $this->assertTrue((new VagueQuestionDetector())->isVague($msg), "debería ser vaga: \"{$msg}\"");
    }

    public static function vague(): array
    {
        return [
            ['Resume el plan'],
            ['resumen del plan de gobierno'],
            ['¿De qué trata este documento?'],
            ['¿Qué contiene tu plan?'],
            ['¿Qué hay en el plan?'],
            ['menu'],
            ['¿Qué puedo preguntarte?'],
            ['¿Cuáles son tus propuestas?'],
            ['¿Qué propones?'],
            ['Hola'],
            ['Buenas tardes'],
            ['info'],
        ];
    }

    /** @dataProvider specific */
    public function test_does_not_flag_specific_questions_as_vague(string $msg): void
    {
        $this->assertFalse((new VagueQuestionDetector())->isVague($msg), "NO debería ser vaga: \"{$msg}\"");
    }

    public static function specific(): array
    {
        return [
            ['¿Qué propones sobre agricultura y riego?'],
            ['¿Cuál es el presupuesto para el canal de riego Agua Blanca?'],
            ['¿En qué página habla de seguridad ciudadana?'],
            ['¿Cuántos años de experiencia tiene el candidato?'],
            ['¿Qué dice sobre San Miguel?'],
        ];
    }

    public function test_empty_message_is_not_vague(): void
    {
        $this->assertFalse((new VagueQuestionDetector())->isVague('   '));
    }
}
