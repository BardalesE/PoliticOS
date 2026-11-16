<?php

namespace App\Services\Llm;

/** Groq respondió 429. `retryAfter` viene del header Retry-After (segundos). */
class GroqRateLimitException extends \RuntimeException
{
    public function __construct(public readonly int $retryAfter, string $message = 'Groq: rate limit (429)')
    {
        parent::__construct($message);
    }
}
