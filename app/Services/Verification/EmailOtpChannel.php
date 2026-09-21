<?php

namespace App\Services\Verification;

use App\Mail\OtpCodeMail;
use Illuminate\Support\Facades\Mail;

class EmailOtpChannel implements OtpChannel
{
    public function isConfigured(): bool
    {
        // Con MAIL_MAILER=log|array el "envío" solo escribe en el log: en producción
        // eso dejaría a los usuarios esperando un correo que jamás llega.
        $mailer = (string) config('mail.default');

        return !in_array($mailer, ['log', 'array'], true) || !app()->isProduction();
    }

    public function send(string $to, string $code): void
    {
        Mail::to($to)->send(new OtpCodeMail($code, (int) config('verification.ttl_minutes')));
    }
}
