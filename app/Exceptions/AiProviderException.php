<?php

namespace App\Exceptions;

/**
 * Error HTTP de un provider de IA (Groq/Claude/OpenAI), con el status y el
 * `Retry-After` (si el provider lo mandó) disponibles para que quien llame
 * decida: reintentar (429, transitorio) o saltar al siguiente provider sin
 * reintentar (401/403, permanente — reintentar no cambia nada).
 */
class AiProviderException extends \RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $status,
        public readonly ?int $retryAfterSeconds = null,
    ) {
        parent::__construct($message);
    }

    public function isRateLimited(): bool
    {
        return $this->status === 429;
    }
}
