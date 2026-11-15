<?php

namespace App\Services;

/**
 * Pregunta "vaga/general" (Fase 2.1a): el ciudadano pide una vista general del
 * documento ("resume el plan", "de qué trata") en vez de algo específico. En
 * ese caso DeepAnalysisQueryService responde con el menú (resumen + índice)
 * SIN llamar al LLM. Anclado a fin de cadena (`$`) a propósito: una pregunta
 * con tema después ("¿qué propones sobre agricultura?") NO es vaga.
 */
class VagueQuestionDetector
{
    private const PATTERNS = [
        '/\bresum[ei]|res[uú]meme\b/iu',
        '/\bde\s+qu[eé]\s+trata\b/iu',
        '/\bqu[eé]\s+contiene\b/iu',
        '/\bqu[eé]\s+(hay|dice)\s+(en\s+)?(el\s+|tu\s+|su\s+)?(plan|documento)\b/iu',
        '/\bmenu\b/iu',
        '/\bqu[eé]\s+puedo\s+preguntar(te)?\b/iu',
        '/\b(cu[aá]les?\s+son\s+)?(tus|sus)\s+propuestas\s*\??\s*$/iu',
        '/\bqu[eé]\s+propone[s]?\s*\??\s*$/iu',
        '/^\s*(hola|holaa+|buenas|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|hey)\s*[!¡.]*\s*$/iu',
        '/^\s*(info|informaci[oó]n|ayuda)\s*[!¡.?]*\s*$/iu',
    ];

    public function isVague(string $message): bool
    {
        $msg = trim($message);
        if ($msg === '') {
            return false;
        }

        foreach (self::PATTERNS as $pattern) {
            if (preg_match($pattern, $msg)) {
                return true;
            }
        }

        return false;
    }
}
