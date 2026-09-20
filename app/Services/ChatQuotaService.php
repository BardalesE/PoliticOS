<?php

namespace App\Services;

use App\Models\AiSetting;
use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\CitizenProfile;

/**
 * Tope de mensajes del chat público (protege el gasto de IA antes de llamarla).
 *
 * Tres capas, todas contando mensajes del USUARIO en el servidor:
 *  1. Por conversación: N mensajes (N = ai_settings.max_messages_per_session,
 *     10–50, lo fija el superadmin por candidato). Quien deja sus datos
 *     (perfil ciudadano ligado a su visitor_id) recibe otros N: 2N.
 *  2. Por visitante en 24 h: 3N (6N si está registrado). Sin esta capa, "iniciar
 *     conversación nueva" reiniciaría el tope y no limitaría nada.
 *  3. Por red (IP) en 24 h: 10N. Cortafuegos contra quien rota de visitor_id;
 *     lo bastante holgado para una oficina/equipo detrás de la misma IP.
 *
 * El session_id y el visitor_id los manda el cliente (falsificables), por eso la
 * capa 3 existe y por eso ninguna capa reemplaza a las demás.
 */
class ChatQuotaService
{
    public const VISITOR_DAILY_FACTOR            = 3;
    public const REGISTERED_VISITOR_DAILY_FACTOR = 6;
    public const NETWORK_DAILY_FACTOR            = 10;

    public const BLOCK_SESSION = 'session';
    public const BLOCK_DAILY   = 'daily';
    public const BLOCK_NETWORK = 'network';

    /**
     * @return array{
     *   base:int, max:int, used:int, remaining:int, registered:bool,
     *   blocked:?string, can_unlock:bool, can_new_session:bool, resets_at:?string
     * }
     */
    public function evaluate(ChatSession $session): array
    {
        $base       = AiSetting::current()->sessionMessageLimit();
        $registered = $this->isRegistered($session);

        $sessionCap  = $registered ? $base * 2 : $base;
        $sessionUsed = $this->countUserMessages(fn ($q) => $q->where('chat_sessions.id', $session->id));

        $dailyCap  = $base * ($registered ? self::REGISTERED_VISITOR_DAILY_FACTOR : self::VISITOR_DAILY_FACTOR);
        $dailyUsed = $session->visitor_uuid
            ? $this->countUserMessages(fn ($q) => $q->where('chat_sessions.visitor_uuid', $session->visitor_uuid), 24)
            : 0;

        $networkCap  = $base * self::NETWORK_DAILY_FACTOR;
        $networkUsed = $session->ip
            ? $this->countUserMessages(fn ($q) => $q->where('chat_sessions.ip', $session->ip), 24)
            : 0;

        $sessionLeft = max(0, $sessionCap - $sessionUsed);
        $dailyLeft   = max(0, $dailyCap - $dailyUsed);
        $networkLeft = max(0, $networkCap - $networkUsed);

        $blocked = match (true) {
            $sessionLeft === 0 => self::BLOCK_SESSION,
            $dailyLeft === 0   => self::BLOCK_DAILY,
            $networkLeft === 0 => self::BLOCK_NETWORK,
            default            => null,
        };

        $resetsAt = null;
        if (in_array($blocked, [self::BLOCK_DAILY, self::BLOCK_NETWORK], true)) {
            $oldest = ChatMessage::query()
                ->join('chat_sessions', 'chat_sessions.id', '=', 'chat_messages.session_id')
                ->where('chat_messages.role', 'user')
                ->where('chat_messages.created_at', '>=', now()->subDay())
                ->when(
                    $blocked === self::BLOCK_DAILY,
                    fn ($q) => $q->where('chat_sessions.visitor_uuid', $session->visitor_uuid),
                    fn ($q) => $q->where('chat_sessions.ip', $session->ip)
                )
                ->min('chat_messages.created_at');
            $resetsAt = $oldest ? \Illuminate\Support\Carbon::parse($oldest)->addDay()->toIso8601String() : null;
        }

        return [
            'base'            => $base,
            'max'             => $sessionCap,
            'used'            => $sessionUsed,
            'remaining'       => min($sessionLeft, $dailyLeft, $networkLeft),
            'registered'      => $registered,
            'blocked'         => $blocked,
            // Solo se ofrece "deja tus datos" si aún no lo hizo y el tope que pegó es el de la conversación.
            'can_unlock'      => !$registered && $blocked === self::BLOCK_SESSION,
            // Una conversación nueva solo ayuda si los topes diario y de red aún tienen margen.
            'can_new_session' => $dailyLeft > 0 && $networkLeft > 0,
            'resets_at'       => $resetsAt,
        ];
    }

    /** Respuesta de chat lista para devolver cuando el tope ya se alcanzó (sin llamar a la IA). */
    public function blockedResponse(array $quota): array
    {
        $reply = match ($quota['blocked']) {
            self::BLOCK_SESSION => $quota['can_unlock']
                ? "⏳ **Mensajes agotados.** Llegaste al límite de {$quota['max']} mensajes de esta conversación.\n\nDeja tus datos y te habilito **{$quota['base']} mensajes más**, o inicia una conversación nueva."
                : "⏳ **Mensajes agotados.** Llegaste al límite de {$quota['max']} mensajes de esta conversación." . ($quota['can_new_session'] ? "\n\nPuedes iniciar una conversación nueva para seguir." : "\n\nVuelve mañana para seguir conversando."),
            self::BLOCK_DAILY   => "⏳ **Mensajes agotados por hoy.** Alcanzaste el límite diario de mensajes. Vuelve mañana para seguir conversando.",
            default             => "⏳ **Límite de mensajes alcanzado** desde tu red por hoy. Intenta de nuevo más tarde.",
        };

        return [
            'reply' => $reply,
            'topic' => null, 'media' => [], 'attack_detected' => false,
            'attack_category' => null, 'pepa_metadata' => null,
            'nonsense' => false, 'blocked' => false, 'quickReplies' => [],
            'quota' => $quota,
        ];
    }

    private function isRegistered(ChatSession $session): bool
    {
        return !empty($session->visitor_uuid)
            && CitizenProfile::where('visitor_uuid', $session->visitor_uuid)->exists();
    }

    /** Mensajes del usuario que cumplen $scope (sobre chat_sessions), opcionalmente en las últimas $hours. */
    private function countUserMessages(callable $scope, ?int $hours = null): int
    {
        return (int) ChatMessage::query()
            ->join('chat_sessions', 'chat_sessions.id', '=', 'chat_messages.session_id')
            ->where('chat_messages.role', 'user')
            ->when($hours, fn ($q) => $q->where('chat_messages.created_at', '>=', now()->subHours($hours)))
            ->tap($scope)
            ->count();
    }
}
