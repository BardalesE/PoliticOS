<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class OtpCodeMail extends Mailable
{
    public function __construct(public string $code, public int $ttlMinutes) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Tu código de verificación: {$this->code}");
    }

    public function content(): Content
    {
        $code = e($this->code);
        $html = <<<HTML
<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1f2937">
  <p style="margin:0 0 12px">Hola, este es tu código para verificar tu correo:</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 12px">{$code}</p>
  <p style="font-size:13px;color:#6b7280;margin:0">Vence en {$this->ttlMinutes} minutos. Si no lo pediste, ignora este mensaje.</p>
</div>
HTML;

        return new Content(htmlString: $html);
    }
}
