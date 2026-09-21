<?php

namespace App\Services\Verification;

use App\Models\ContactVerification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Throwable;

/**
 * Verificación por código (OTP) del correo y del WhatsApp de un lead.
 * Los códigos se guardan como HMAC, vencen, tienen tope de intentos y de envíos.
 */
class ContactVerificationService
{
    public const EMAIL    = 'email';
    public const WHATSAPP = 'whatsapp';

    public function __construct(
        private readonly EmailOtpChannel $email,
        private readonly WhatsAppOtpChannel $whatsapp,
    ) {}

    /** Canales que hoy se exigen: los habilitados y realmente configurados. */
    public function activeChannels(): array
    {
        if (!config('verification.enabled')) {
            return [];
        }

        $active = [];
        if ($this->email->isConfigured())    $active[] = self::EMAIL;
        if ($this->whatsapp->isConfigured()) $active[] = self::WHATSAPP;

        return $active;
    }

    // ── Normalización ────────────────────────────────────────────────────

    public function normalize(string $channel, ?string $raw): ?string
    {
        $raw = trim((string) $raw);
        if ($raw === '') {
            return null;
        }

        if ($channel === self::EMAIL) {
            $email = mb_strtolower($raw);

            return filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
        }

        // WhatsApp: solo dígitos con código de país. Un celular peruano (9 dígitos, empieza en 9) recibe 51.
        $digits = preg_replace('/\D+/', '', $raw) ?? '';
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }
        if (strlen($digits) === 9 && $digits[0] === '9') {
            $digits = '51' . $digits;
        }

        return preg_match('/^\d{10,15}$/', $digits) ? $digits : null;
    }

    public function mask(string $channel, string $contact): string
    {
        if ($channel === self::EMAIL) {
            [$user, $domain] = explode('@', $contact, 2) + ['', ''];

            return mb_substr($user, 0, 1) . '***@' . $domain;
        }

        return '+' . substr($contact, 0, 2) . '*****' . substr($contact, -3);
    }

    // ── Envío ────────────────────────────────────────────────────────────

    /** @return array{expires_in:int, resend_in:int, masked:string} */
    public function start(string $channel, string $rawContact, ?string $visitor, ?string $ip): array
    {
        if (!in_array($channel, $this->activeChannels(), true)) {
            throw new VerificationException('Este canal de verificación no está disponible por ahora.', 422, null, 'channel_unavailable');
        }

        $contact = $this->normalize($channel, $rawContact);
        if ($contact === null) {
            throw new VerificationException(
                $channel === self::EMAIL ? 'Ese correo no parece válido.' : 'Ese número de WhatsApp no parece válido. Usa 9 dígitos, por ejemplo 987654321.',
                422, null, 'invalid_contact'
            );
        }

        $cooldown = (int) config('verification.resend_cooldown');
        $last = $this->scope(ContactVerification::query()->where('channel', $channel)->where('contact', $contact), $visitor)
            ->latest('id')->first();
        if ($last && $last->created_at->addSeconds($cooldown)->isFuture()) {
            $wait = max(1, (int) now()->diffInSeconds($last->created_at->addSeconds($cooldown), false));
            throw new VerificationException("Espera {$wait} s para pedir otro código.", 429, $wait, 'cooldown');
        }

        $this->throttle($channel, $contact, $visitor, $ip);

        $code = str_pad((string) random_int(0, 10 ** (int) config('verification.code_length') - 1), (int) config('verification.code_length'), '0', STR_PAD_LEFT);
        $ttl  = (int) config('verification.ttl_minutes');

        // Un solo código vigente por contacto y dispositivo.
        $this->scope(ContactVerification::query()->where('channel', $channel)->where('contact', $contact), $visitor)
            ->whereNull('verified_at')->whereNull('consumed_at')->delete();

        $record = ContactVerification::create([
            'channel'      => $channel,
            'contact'      => $contact,
            'visitor_uuid' => $visitor,
            'code_hash'    => $this->hash($channel, $contact, $code),
            'ip'           => $ip,
            'expires_at'   => now()->addMinutes($ttl),
        ]);

        try {
            ($channel === self::EMAIL ? $this->email : $this->whatsapp)->send($contact, $code);
        } catch (Throwable $e) {
            $record->delete();
            Log::error('OTP: fallo al enviar', ['channel' => $channel, 'error' => $e->getMessage()]);

            throw new VerificationException(
                $channel === self::EMAIL
                    ? 'No pudimos enviar el correo. Revisa que esté bien escrito e intenta de nuevo.'
                    : 'No pudimos enviar el mensaje de WhatsApp. Revisa el número e intenta de nuevo.',
                503, null, 'send_failed'
            );
        }

        return ['expires_in' => $ttl * 60, 'resend_in' => $cooldown, 'masked' => $this->mask($channel, $contact)];
    }

    // ── Confirmación ─────────────────────────────────────────────────────

    public function confirm(string $channel, string $rawContact, string $code, ?string $visitor): void
    {
        $contact = $this->normalize($channel, $rawContact);
        $record  = $contact === null ? null : $this->scope(
            ContactVerification::query()->where('channel', $channel)->where('contact', $contact), $visitor
        )->whereNull('verified_at')->whereNull('consumed_at')->latest('id')->first();

        if (!$record || $record->expires_at->isPast()) {
            throw new VerificationException('El código venció o no existe. Pide uno nuevo.', 422, null, 'expired');
        }

        $max = (int) config('verification.max_attempts');
        if ($record->attempts >= $max) {
            throw new VerificationException('Demasiados intentos. Pide un código nuevo.', 429, null, 'too_many_attempts');
        }

        $record->increment('attempts');

        if (!hash_equals($record->code_hash, $this->hash($channel, $contact, trim($code)))) {
            $left = max(0, $max - $record->attempts);
            throw new VerificationException(
                $left > 0 ? "Código incorrecto. Te quedan {$left} intentos." : 'Código incorrecto. Pide un código nuevo.',
                422, null, 'invalid_code'
            );
        }

        $record->update(['verified_at' => now()]);
    }

    // ── Consulta / consumo (lo usa el registro) ──────────────────────────

    public function isVerified(string $channel, string $normalizedContact, ?string $visitor): bool
    {
        return $this->scope(
            ContactVerification::query()->where('channel', $channel)->where('contact', $normalizedContact), $visitor
        )->whereNull('consumed_at')
            ->where('verified_at', '>=', now()->subMinutes((int) config('verification.verified_window_minutes')))
            ->exists();
    }

    public function consume(string $channel, string $normalizedContact, ?string $visitor): void
    {
        $this->scope(
            ContactVerification::query()->where('channel', $channel)->where('contact', $normalizedContact), $visitor
        )->whereNotNull('verified_at')->whereNull('consumed_at')->update(['consumed_at' => now()]);
    }

    // ── Internos ─────────────────────────────────────────────────────────

    private function scope($query, ?string $visitor)
    {
        return $visitor ? $query->where('visitor_uuid', $visitor) : $query->whereNull('visitor_uuid');
    }

    private function hash(string $channel, string $contact, string $code): string
    {
        return hash_hmac('sha256', "{$channel}|{$contact}|{$code}", (string) config('app.key'));
    }

    private function throttle(string $channel, string $contact, ?string $visitor, ?string $ip): void
    {
        $limits = config('verification.limits');
        $checks = [
            ["otp:contact:{$channel}:" . sha1($contact), $limits['per_contact']],
            ['otp:visitor:' . ($visitor ?? 'none'),      $limits['per_visitor']],
            ['otp:ip:' . ($ip ?? 'none'),                $limits['per_ip']],
        ];

        foreach ($checks as [$key, $rule]) {
            if (RateLimiter::tooManyAttempts($key, $rule['max'])) {
                throw new VerificationException(
                    'Hiciste demasiados intentos. Espera unos minutos y vuelve a probar.',
                    429, RateLimiter::availableIn($key), 'rate_limited'
                );
            }
        }
        foreach ($checks as [$key, $rule]) {
            RateLimiter::hit($key, $rule['minutes'] * 60);
        }
    }
}
