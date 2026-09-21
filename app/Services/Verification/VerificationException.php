<?php

namespace App\Services\Verification;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/** Error de negocio del flujo OTP con mensaje apto para mostrar al ciudadano. */
class VerificationException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $status = 422,
        public readonly ?int $retryAfter = null,
        public readonly string $reason = 'verification_failed',
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(array_filter([
            'message'     => $this->getMessage(),
            'reason'      => $this->reason,
            'retry_after' => $this->retryAfter,
        ], fn ($v) => $v !== null), $this->status);
    }
}
