<?php

namespace App\Services\Verification;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * WhatsApp Cloud API (Meta) con una plantilla de categoría "Authentication"
 * (cuerpo con {{1}} = código y botón "copiar código").
 */
class WhatsAppOtpChannel implements OtpChannel
{
    public function isConfigured(): bool
    {
        return filled(config('verification.whatsapp.token'))
            && filled(config('verification.whatsapp.phone_number_id'))
            && filled(config('verification.whatsapp.template'));
    }

    public function send(string $to, string $code): void
    {
        $cfg = config('verification.whatsapp');

        $response = Http::withToken($cfg['token'])
            ->acceptJson()
            ->timeout(10)
            ->post("https://graph.facebook.com/{$cfg['api_version']}/{$cfg['phone_number_id']}/messages", [
                'messaging_product' => 'whatsapp',
                'to'                => $to,
                'type'              => 'template',
                'template'          => [
                    'name'     => $cfg['template'],
                    'language' => ['code' => $cfg['language']],
                    'components' => [
                        ['type' => 'body', 'parameters' => [['type' => 'text', 'text' => $code]]],
                        ['type' => 'button', 'sub_type' => 'url', 'index' => '0',
                         'parameters' => [['type' => 'text', 'text' => $code]]],
                    ],
                ],
            ]);

        if ($response->failed()) {
            // Sin token ni cuerpo completo en el mensaje: solo el código de error de Meta.
            $err = $response->json('error.code') ?? $response->status();
            throw new RuntimeException("WhatsApp Cloud API rechazó el envío (error {$err}).");
        }
    }
}
