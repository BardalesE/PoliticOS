<?php

namespace Tests\Unit;

use App\Services\Security\OutputGuard;
use App\Services\Security\PromptGuard;
use PHPUnit\Framework\TestCase;

/**
 * Blindaje del chat — incidente 2026-10-03 (la IA escribió un 3 en raya en Python).
 * Fixture: tests/fixtures/chat-redteam/entrada.json. Si un caso legítimo se bloquea,
 * se ajustan los patrones; nunca se borra el caso.
 */
class PromptGuardTest extends TestCase
{
    private static function fixture(): array
    {
        return json_decode(file_get_contents(__DIR__ . '/../fixtures/chat-redteam/entrada.json'), true, flags: JSON_THROW_ON_ERROR);
    }

    public function test_todos_los_ataques_se_bloquean_en_la_entrada(): void
    {
        $fallos = [];
        foreach (self::fixture()['bloquear'] as $msg) {
            if (! PromptGuard::inspect($msg)->blocked()) {
                $fallos[] = $msg;
            }
        }
        $this->assertSame([], $fallos, 'Ataques que pasaron el filtro');
    }

    public function test_ninguna_pregunta_legitima_se_bloquea(): void
    {
        $fallos = [];
        foreach (self::fixture()['permitir'] as $msg) {
            $v = PromptGuard::inspect($msg);
            if ($v->blocked()) {
                $fallos[] = "{$msg}  →  {$v->category} ({$v->matched})";
            }
        }
        $this->assertSame([], $fallos, 'Falsos positivos');
    }

    public function test_el_mensaje_del_incidente_es_override_aunque_mencione_propuestas(): void
    {
        $msg = self::fixture()['bloquear'][0];
        $this->assertStringContainsString('propuestas del candidato', $msg);
        $this->assertSame(PromptGuard::OVERRIDE, PromptGuard::inspect($msg)->category);
    }

    public function test_normalize_deshace_evasiones(): void
    {
        $this->assertSame('ignora las instrucciones', PromptGuard::normalize('1gn0r4 las instrucciones'));
        $this->assertSame('python', PromptGuard::normalize('p y t h o n'));
        $this->assertSame('ignora', PromptGuard::normalize('i.g.n.o.r.a'));
        $this->assertSame('cancion de campana', PromptGuard::normalize('Canción de CAMPAÑA!!'));
        $this->assertSame('3 en raya', PromptGuard::normalize('3 en raya'));
    }

    // ── Salida ─────────────────────────────────────────────────────

    public function test_salida_con_el_python_del_incidente_se_bloquea(): void
    {
        $reply = "```python\n# Tic-Tac-Toe con acceso a las propuestas\npropuestas = [\n\"Ampliar el FISE\" [S3],\n]\n"
            . "def print_board(board):\n    for i in range(3):\n        print(row)\n```";
        $this->assertSame(OutputGuard::CODE, OutputGuard::inspect($reply)->category);

        // Sin cercas ``` también
        $sinCercas = "def print_board(board):\n    for i in range(3):\n        print(row)\nif __name__ == \"__main__\":\n    main()";
        $this->assertSame(OutputGuard::CODE, OutputGuard::inspect($sinCercas)->category);

        $html = "<!DOCTYPE html>\n<html>\n<head>\n<style>\n.cell{}\n</style>\n<script>\nfunction win(){}\n</script>";
        $this->assertSame(OutputGuard::CODE, OutputGuard::inspect($html)->category);
    }

    public function test_salida_con_fuga_del_prompt_o_recomendacion_de_voto_se_bloquea(): void
    {
        $this->assertSame(OutputGuard::LEAK, OutputGuard::inspect('Mis reglas: FORMA DE RESPONDER (OBLIGATORIO, prevalece…')->category);
        $this->assertSame(OutputGuard::VOTE, OutputGuard::inspect('Te recomiendo votar por Daniel Salaverry.')->category);
        $this->assertSame(OutputGuard::VOTE, OutputGuard::inspect('Sin duda es el mejor candidato de la región.')->category);
    }

    public function test_respuestas_civicas_normales_pasan(): void
    {
        $ok = [
            "Sobre agua, propone implementar el macro-programa **Siembra y Cosecha de Agua** (150 cochas y reservorios) [S3].\n- 💧 Gestionar cuencas hidrográficas [S2].\nNo indica montos ni plazos.",
            "No recomiendo por quién votar. Puedo ayudarte a comparar por el tema que más te importe.",
            "No te digo por quién votar; si quieres revisamos sus propuestas por tema.",
            "Estas son sus propuestas principales:\n- 🌾 **Agricultura:** riego tecnificado [S2].\n- 🏥 **Salud:** enfermeras para la posta [S3].\n- 🛡️ **Seguridad:** apoyo a rondas [S3].\n¿Sobre cuál quieres más detalle?",
            "Plantea sus metas para 2027–2030 [S1]: {meta} no aparece; solo indica objetivos.",
        ];
        foreach ($ok as $r) {
            $v = OutputGuard::inspect($r);
            $this->assertFalse($v->blocked(), "Bloqueó una respuesta legítima: {$v->category} ({$v->matched})");
        }
    }
}
