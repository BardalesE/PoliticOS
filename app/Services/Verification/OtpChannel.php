<?php

namespace App\Services\Verification;

interface OtpChannel
{
    /** ¿Está el canal realmente listo para enviar en este servidor? */
    public function isConfigured(): bool;

    /** Envía el código. Lanza una excepción si no se pudo entregar. */
    public function send(string $to, string $code): void;
}
