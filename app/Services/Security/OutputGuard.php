<?php

namespace App\Services\Security;

/**
 * Guardia de SALIDA del chat ciudadano (capa 3 de 3). Si el modelo se salta el filtro
 * de entrada y el prompt, su respuesta igual no llega al vecino: se reemplaza por la
 * respuesta fija de rol (CivicAIService::buildGuardResponse) y no se guarda.
 *
 * Solo patrones que una respuesta cívica legítima nunca produce: bloques de código,
 * fuga del prompt de sistema y recomendación de voto.
 */
final class OutputGuard
{
    public const CODE       = 'output_code';
    public const LEAK       = 'output_prompt_leak';
    public const VOTE       = 'output_vote_advice';

    /** Frases literales del prompt de sistema / contexto que nunca deben salir al vecino. */
    private const CENTINELAS = [
        'FICHA DEL CANDIDATO', 'LISTA DE REGIDORES', 'CONTEXTO DISPONIBLE PARA ESTA RESPUESTA', 'FIN CONTEXTO',
        'FORMA DE RESPONDER (OBLIGATORIO', 'SOLO TEXTO (OBLIGATORIO', 'SEGURIDAD (OBLIGATORIO', '{{', 'pregunta_del_ciudadano',
    ];

    public static function inspect(string $reply): GuardVerdict
    {
        if (trim($reply) === '') {
            return GuardVerdict::ok();
        }

        if ($m = self::codeSignal($reply)) {
            return new GuardVerdict(self::CODE, $m);
        }

        foreach (self::CENTINELAS as $c) {
            if (str_contains($reply, $c)) {
                return new GuardVerdict(self::LEAK, $c);
            }
        }

        $flat = PromptGuard::normalize($reply);
        if (preg_match('/\b(te recomiendo|te sugiero|deberias|debes|tienes que|hay que|vota|voten|votemos)\s+(votar\s+)?por\s+(?!quien|que|el tema|los temas|temas|revisar|comparar)\w+/u', $flat, $m)
            || preg_match('/\b(es|sera|seria) (el|la) mejor (candidat|opcion|alcalde|alcaldesa|gobernador|gobernadora)/u', $flat, $m)
            || preg_match('/\bno (votes|voten) por\b/u', $flat, $m)) {
            return new GuardVerdict(self::VOTE, $m[0]);
        }

        return GuardVerdict::ok();
    }

    private static function codeSignal(string $reply): ?string
    {
        if (str_contains($reply, '```')) {
            return '```';
        }

        $lineas = preg_split('/\R/u', $reply) ?: [];
        $hits   = 0;
        $first  = null;
        $re = '/^\s*(def \w+\s*\(|import \w+|from [\w\.]+ import|class \w+\s*[\(:{]|function\s*\w*\s*\(|const \w+\s*=|let \w+\s*=|var \w+\s*=|'
            . '#include|public (static )?\w+|print\s*\(|console\.log|document\.|<\?php|<!doctype|<\/?(html|head|body|script|style|div|button|canvas|table)\b|'
            . 'if __name__|for \w+ in |while .+:\s*$|return\b.*[;:]?\s*$|\w+\s*=\s*\[.*$|\}\s*$|\{\s*$)/iu';

        foreach ($lineas as $l) {
            if (preg_match($re, $l)) {
                $hits++;
                $first ??= trim(mb_substr($l, 0, 60));
                if ($hits >= 3) {
                    return $first;
                }
            }
        }

        return null;
    }
}
