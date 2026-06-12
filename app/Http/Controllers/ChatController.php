<?php

namespace App\Http\Controllers;

use App\Jobs\AnalyzeMessageJob;
use App\Jobs\GeolocateSessionJob;
use App\Models\AiSetting;
use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\CitizenProfile;
use App\Models\CitizenPoint;
use App\Services\PlanService;
use App\Models\CitizenData;
use App\Models\VisitorProfile;
use App\Services\CivicAIService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ChatController extends Controller
{
    public function __construct(private CivicAIService $ai) {}

    /** POST /api/chat — respuesta completa, no streaming */
    public function send(Request $request): JsonResponse
    {
        $data = $request->validate([
            'message'     => ['required','string','min:1','max:2000'],
            'session_id'  => ['nullable','string','max:64'],
            'consent'     => ['nullable','boolean'],
            'declared'    => ['nullable','array'],
            'initialized' => ['nullable','boolean'],
            'lat'         => ['nullable','numeric','between:-90,90'],
            'lng'         => ['nullable','numeric','between:-180,180'],
            'accuracy'    => ['nullable','numeric','min:0'],
        ]);

        $session = $this->resolveSession($request, $data['session_id'] ?? null, $data['consent'] ?? null);

        // ── Guardar GPS del navegador si se envió y no se tenía ───────────
        if (!empty($data['lat']) && !empty($data['lng']) && !$session->browser_lat) {
            $session->update([
                'browser_lat'          => $data['lat'],
                'browser_lng'          => $data['lng'],
                'browser_accuracy'     => $data['accuracy'] ?? null,
                'browser_location_at'  => now(),
            ]);
        }

        // ── 0. Límite mensual de mensajes del plan ────────────────────────
        $tenant = app('tenant');
        if ($tenant) {
            $limit = PlanService::messagesPerMonth($tenant);
            if ($limit !== -1) {
                $used = ChatMessage::where('role', 'user')
                    ->whereMonth('created_at', now()->month)
                    ->whereYear('created_at', now()->year)
                    ->count();
                if ($used >= $limit) {
                    $limitResponse = [
                        'reply'            => "⚠️ Este asistente alcanzó el límite mensual de mensajes de su plan. Por favor vuelve el próximo mes.",
                        'topic'            => null, 'media' => [], 'attack_detected' => false,
                        'attack_category'  => null, 'pepa_metadata' => null,
                        'nonsense'         => false, 'blocked' => false, 'quickReplies' => [],
                    ];
                    return $this->jsonChatResponse($limitResponse, $session, $request);
                }
            }
        }

        // ── 1. Sesión bloqueada ───────────────────────────────────────────
        if ($session->blocked_at) {
            if (!$this->isResetKeyword($data['message'])) {
                $blocked = $this->ai->buildBlockedResponse();
                return $this->jsonChatResponse($blocked, $session, $request);
            }
            $session->update(['blocked_at' => null, 'nonsense_count' => 0]);
            $welcome = $this->ai->buildWelcomeResponse();
            $this->saveExchange($session, $data['message'], $welcome);
            $this->capturePotentialDeclaredData($session, $data['declared'] ?? []);
            return $this->jsonChatResponse($welcome, $session, $request);
        }

        // ── 2. Primer mensaje → bienvenida (solo si el chat NO fue inicializado
        //       por el flujo de registro en el frontend)
        $priorCount = ChatMessage::where('session_id', $session->id)->count();
        if ($priorCount === 0 && !($data['initialized'] ?? false)) {
            $welcome = $this->ai->buildWelcomeResponse();
            $this->saveExchange($session, $data['message'], $welcome);
            $this->capturePotentialDeclaredData($session, $data['declared'] ?? []);
            return $this->jsonChatResponse($welcome, $session, $request);
        }

        // ── 3. Moderación: mensaje sin sentido (antes de llamar a la IA) ─
        if ($this->ai->isNonsense($data['message'])) {
            $newCount = ($session->nonsense_count ?? 0) + 1;
            $session->update(['nonsense_count' => $newCount]);

            if ($newCount >= 2) {
                $session->update(['blocked_at' => now()]);
                $response = $this->ai->buildBlockedResponse();
            } else {
                $response = $this->ai->buildNonsenseWarning();
            }

            ChatMessage::create(['session_id' => $session->id, 'role' => 'user',  'content' => $data['message']]);
            ChatMessage::create(['session_id' => $session->id, 'role' => 'assistant', 'content' => $response['reply'], 'media' => '[]']);
            return $this->jsonChatResponse($response, $session, $request);
        }

        // Mensaje válido → reinicia contador de nonsense
        if (($session->nonsense_count ?? 0) > 0) {
            $session->update(['nonsense_count' => 0]);
        }

        // ── 4. Flujo normal ───────────────────────────────────────────────
        $userMsg = ChatMessage::create([
            'session_id' => $session->id,
            'role'       => 'user',
            'content'    => $data['message'],
        ]);

        $response = $this->ai->respond($data['message'], $session);

        ChatMessage::create([
            'session_id'      => $session->id,
            'role'            => 'assistant',
            'content'         => $response['reply'],
            'topic'           => $response['topic'] ?? null,
            'media'           => json_encode($response['media'] ?? []),
            'attack_detected' => $response['attack_detected'] ?? false,
            'attack_category' => $response['attack_category'] ?? null,
            'pepa_metadata'   => $response['pepa_metadata'] ?? null,
        ]);

        $this->applyPepaMetaToSession($session, $response['pepa_metadata'] ?? null);
        $this->capturePotentialDeclaredData($session, $data['declared'] ?? []);

        AnalyzeMessageJob::dispatch($userMsg->id)->afterResponse();
        if (!$session->geo_country) {
            GeolocateSessionJob::dispatch($session->id)->afterResponse();
        }

        return $this->jsonChatResponse($response, $session, $request);
    }

    /** POST /api/chat/stream — SSE */
    public function stream(Request $request): StreamedResponse
    {
        $data = $request->validate([
            'message'     => ['required','string','min:1','max:2000'],
            'session_id'  => ['nullable','string','max:64'],
            'consent'     => ['nullable','boolean'],
            'declared'    => ['nullable','array'],
            'initialized' => ['nullable','boolean'],
            'lat'         => ['nullable','numeric','between:-90,90'],
            'lng'         => ['nullable','numeric','between:-180,180'],
            'accuracy'    => ['nullable','numeric','min:0'],
        ]);

        $session = $this->resolveSession($request, $data['session_id'] ?? null, $data['consent'] ?? null);

        // ── Guardar GPS del navegador si se envió y no se tenía ───────────
        if (!empty($data['lat']) && !empty($data['lng']) && !$session->browser_lat) {
            $session->update([
                'browser_lat'         => $data['lat'],
                'browser_lng'         => $data['lng'],
                'browser_accuracy'    => $data['accuracy'] ?? null,
                'browser_location_at' => now(),
            ]);
        }

        // ── 0. Límite mensual de mensajes del plan ────────────────────────
        $tenantForStream = app('tenant');
        if ($tenantForStream) {
            $streamLimit = PlanService::messagesPerMonth($tenantForStream);
            if ($streamLimit !== -1) {
                $streamUsed = ChatMessage::where('role', 'user')
                    ->whereMonth('created_at', now()->month)
                    ->whereYear('created_at', now()->year)
                    ->count();
                if ($streamUsed >= $streamLimit) {
                    $limitResponse = [
                        'reply' => "⚠️ Este asistente alcanzó el límite mensual de mensajes de su plan.",
                        'topic' => null, 'media' => [], 'attack_detected' => false,
                        'attack_category' => null, 'pepa_metadata' => null,
                        'nonsense' => false, 'blocked' => false, 'quickReplies' => [],
                    ];
                    return $this->streamPrebuilt($limitResponse, $session);
                }
            }
        }

        // ── 1. Sesión bloqueada ───────────────────────────────────────────
        if ($session->blocked_at) {
            if (!$this->isResetKeyword($data['message'])) {
                $blocked = $this->ai->buildBlockedResponse();
                return $this->streamPrebuilt($blocked, $session);
            }
            $session->update(['blocked_at' => null, 'nonsense_count' => 0]);
            $welcome = $this->ai->buildWelcomeResponse();
            $this->saveExchange($session, $data['message'], $welcome);
            $this->capturePotentialDeclaredData($session, $data['declared'] ?? []);
            return $this->streamPrebuilt($welcome, $session);
        }

        // ── 2. Primer mensaje → bienvenida (solo si no fue inicializado
        //       por el flujo de registro del frontend)
        $priorCount = ChatMessage::where('session_id', $session->id)->count();
        if ($priorCount === 0 && !($data['initialized'] ?? false)) {
            $welcome = $this->ai->buildWelcomeResponse();
            $this->saveExchange($session, $data['message'], $welcome);
            $this->capturePotentialDeclaredData($session, $data['declared'] ?? []);
            return $this->streamPrebuilt($welcome, $session);
        }

        // ── 3. Moderación: mensaje sin sentido ───────────────────────────
        if ($this->ai->isNonsense($data['message'])) {
            $newCount = ($session->nonsense_count ?? 0) + 1;
            $session->update(['nonsense_count' => $newCount]);

            if ($newCount >= 2) {
                $session->update(['blocked_at' => now()]);
                $response = $this->ai->buildBlockedResponse();
            } else {
                $response = $this->ai->buildNonsenseWarning();
            }

            ChatMessage::create(['session_id' => $session->id, 'role' => 'user',  'content' => $data['message']]);
            ChatMessage::create(['session_id' => $session->id, 'role' => 'assistant', 'content' => $response['reply'], 'media' => '[]']);
            return $this->streamPrebuilt($response, $session);
        }

        if (($session->nonsense_count ?? 0) > 0) {
            $session->update(['nonsense_count' => 0]);
        }

        $userMsg = ChatMessage::create([
            'session_id' => $session->id,
            'role'       => 'user',
            'content'    => $data['message'],
        ]);
        $this->capturePotentialDeclaredData($session, $data['declared'] ?? []);

        return response()->stream(
            function () use ($session, $userMsg, $data) {
                try {
                    while (ob_get_level() > 0) ob_end_clean();

                    $fullReply = '';
                    $meta = $this->ai->respondStream(
                        $data['message'],
                        $session,
                        function (string $chunk) use (&$fullReply) {
                            $fullReply .= $chunk;
                            echo 'data: '.json_encode(['chunk' => $chunk])."\n\n";
                            flush();
                        }
                    );

                    if (empty($fullReply)) {
                        $fallback = 'Disculpa, tengo un inconveniente técnico en este momento. Por favor intenta de nuevo en unos minutos.';
                        echo 'data: '.json_encode(['chunk' => $fallback])."\n\n";
                        flush();
                        $fullReply = $fallback;
                        $meta = array_merge($meta ?? [], ['media' => [], 'topic' => null, 'attack_detected' => false]);
                    }

                    try {
                        ChatMessage::create([
                            'session_id'      => $session->id,
                            'role'            => 'assistant',
                            'content'         => $fullReply,
                            'topic'           => $meta['topic'] ?? null,
                            'media'           => json_encode($meta['media'] ?? []),
                            'attack_detected' => $meta['attack_detected'] ?? false,
                            'attack_category' => $meta['attack_category'] ?? null,
                            'pepa_metadata'   => $meta['pepa_metadata'] ?? null,
                        ]);
                        $this->applyPepaMetaToSession($session, $meta['pepa_metadata'] ?? null);
                        AnalyzeMessageJob::dispatch($userMsg->id)->afterResponse();
                        if (!$session->geo_country) {
                            GeolocateSessionJob::dispatch($session->id)->afterResponse();
                        }
                    } catch (\Throwable $e) {
                        Log::error('Stream post-processing failed', ['error' => $e->getMessage()]);
                    }

                    echo 'data: '.json_encode([
                        'done'           => true,
                        'media'          => $meta['media'] ?? [],
                        'topic'          => $meta['topic'] ?? null,
                        'sessionId'      => $session->session_id,
                        'attackDetected' => $meta['attack_detected'] ?? false,
                        'nonsense'       => false,
                        'blocked'        => false,
                        'quickReplies'   => $meta['quickReplies'] ?? [],
                        'mode'           => $this->assistantMode(),
                        'pepa'           => $this->pepaPayload($meta['pepa_metadata'] ?? null),
                    ])."\n\n";
                    flush();
                } catch (\Throwable $e) {
                    Log::error('Stream callback fatal error', ['error' => $e->getMessage()]);
                    echo 'data: '.json_encode(['chunk' => 'Hubo un error al procesar tu mensaje. Por favor intenta de nuevo.'])."\n\n";
                    echo 'data: '.json_encode([
                        'done'           => true,
                        'media'          => [],
                        'topic'          => null,
                        'sessionId'      => $session->session_id ?? null,
                        'attackDetected' => false,
                        'nonsense'       => false,
                        'blocked'        => false,
                        'quickReplies'   => [],
                    ])."\n\n";
                    flush();
                }
            },
            200,
            [
                'Content-Type'      => 'text/event-stream',
                'Cache-Control'     => 'no-cache, no-store',
                'X-Accel-Buffering' => 'no',
                'Connection'        => 'keep-alive',
            ]
        );
    }

    /** GET /api/chat/session/{id} */
    public function session(string $id): JsonResponse
    {
        $session = ChatSession::where('session_id', $id)
            ->with(['messages' => fn($q) => $q->orderBy('created_at')])
            ->firstOrFail();

        return response()->json([
            'sessionId' => $session->session_id,
            'messages'  => $session->messages->map(fn($m) => [
                'id'        => (string) $m->id,
                'role'      => $m->role,
                'content'   => $m->content,
                'topic'     => $m->topic,
                'media'     => json_decode($m->media ?? '[]', true),
                'timestamp' => $m->created_at->timestamp * 1000,
            ]),
        ]);
    }

    /** POST /api/chat/consent — registrar consentimiento explícito */
    public function consent(Request $request): JsonResponse
    {
        $data = $request->validate([
            'session_id' => ['required','string','max:64'],
            'consent'    => ['required','boolean'],
        ]);

        $session = ChatSession::where('session_id', $data['session_id'])->firstOrFail();
        $session->update([
            'consent_data_capture' => $data['consent'],
            'consent_at'           => $data['consent'] ? now() : null,
        ]);

        if ($session->visitor_uuid) {
            VisitorProfile::firstOrCreate(['visitor_uuid' => $session->visitor_uuid])
                ->update(['consented' => $data['consent'], 'consented_at' => $data['consent'] ? now() : null]);
        }

        return response()->json(['ok' => true]);
    }

    // ─── Helpers privados ─────────────────────────────────────────────────

    private function isResetKeyword(string $message): bool
    {
        $clean = mb_strtolower(trim($message));
        foreach (['hola', 'menu', 'menú', 'inicio', 'start', 'comenzar', 'empezar', 'reiniciar', 'reset'] as $kw) {
            if (str_contains($clean, $kw)) return true;
        }
        return false;
    }

    private function saveExchange(ChatSession $session, string $userMessage, array $aiResponse): void
    {
        ChatMessage::create(['session_id' => $session->id, 'role' => 'user',  'content' => $userMessage]);
        ChatMessage::create([
            'session_id' => $session->id,
            'role'       => 'assistant',
            'content'    => $aiResponse['reply'],
            'media'      => json_encode($aiResponse['media'] ?? []),
        ]);

        // Puntos por conversación (una vez al día por ciudadano registrado)
        if ($session->visitor_uuid) {
            $citizen = CitizenProfile::where('visitor_uuid', $session->visitor_uuid)->first();
            if ($citizen) {
                $today = now()->toDateString();
                $alreadyAwarded = CitizenPoint::where('citizen_profile_id', $citizen->id)
                    ->where('action', 'conversacion')
                    ->whereDate('created_at', $today)
                    ->exists();
                if (!$alreadyAwarded) {
                    $citizen->addPoints('conversacion', CitizenProfile::pointsFor('conversacion'));
                }
            }
        }
    }

    /**
     * Subconjunto de pepa_metadata que sí viaja al navegador: fuentes citadas
     * y tema. La metadata interna completa (postura_actual, cambio_de_opinion)
     * es analítica del tenant y se queda en el backend.
     */
    private function pepaPayload(?array $meta): ?array
    {
        if (empty($meta)) {
            return null;
        }

        $payload = array_filter([
            'fuentes_citadas' => $meta['fuentes_citadas'] ?? null,
            'tema_dominante'  => $meta['tema_dominante'] ?? null,
        ]);

        return $payload ?: null;
    }

    private function assistantMode(): string
    {
        return AiSetting::current()->mode ?? 'campaign';
    }

    private function jsonChatResponse(array $response, ChatSession $session, Request $request): JsonResponse
    {
        return response()->json([
            'reply'          => $response['reply'],
            'media'          => $response['media'] ?? [],
            'topic'          => $response['topic'] ?? null,
            'sessionId'      => $session->session_id,
            'attackDetected' => $response['attack_detected'] ?? false,
            'nonsense'       => $response['nonsense'] ?? false,
            'blocked'        => $response['blocked'] ?? false,
            'quickReplies'   => $response['quickReplies'] ?? [],
            'mode'           => $this->assistantMode(),
            'pepa'           => $this->pepaPayload($response['pepa_metadata'] ?? null),
        ])->cookie(
            'politicos_visitor_id',
            $session->visitor_uuid,
            525600,
            '/', null, $request->secure(), true, false, 'lax'
        );
    }

    private function streamPrebuilt(array $response, ChatSession $session): StreamedResponse
    {
        return response()->stream(
            function () use ($response, $session) {
                while (ob_get_level() > 0) ob_end_clean();
                foreach (str_split($response['reply'], 30) as $chunk) {
                    echo 'data: '.json_encode(['chunk' => $chunk])."\n\n";
                    flush();
                }
                echo 'data: '.json_encode([
                    'done'           => true,
                    'media'          => $response['media'] ?? [],
                    'topic'          => $response['topic'] ?? null,
                    'sessionId'      => $session->session_id,
                    'attackDetected' => false,
                    'nonsense'       => $response['nonsense'] ?? false,
                    'blocked'        => $response['blocked'] ?? false,
                    'quickReplies'   => $response['quickReplies'] ?? [],
                    'mode'           => $this->assistantMode(),
                    'pepa'           => $this->pepaPayload($response['pepa_metadata'] ?? null),
                ])."\n\n";
                flush();
            },
            200,
            [
                'Content-Type'      => 'text/event-stream',
                'Cache-Control'     => 'no-cache, no-store',
                'X-Accel-Buffering' => 'no',
                'Connection'        => 'keep-alive',
            ]
        );
    }

    private function resolveSession(Request $request, ?string $sessionId, ?bool $consent): ChatSession
    {
        $sessionId = $sessionId ?: (string) Str::uuid();
        $ctx = $request->attributes->get('request_context', []);

        $session = ChatSession::firstOrCreate(
            ['session_id' => $sessionId],
            [
                'ip'           => $request->ip(),
                'user_agent'   => $request->userAgent(),
                'started_at'   => now(),
                'visitor_uuid' => $ctx['visitor_uuid'] ?? (string) Str::uuid(),
                'referrer'     => $ctx['referrer'] ?? null,
                'utm_source'   => $ctx['utm_source'] ?? null,
                'utm_medium'   => $ctx['utm_medium'] ?? null,
                'utm_campaign' => $ctx['utm_campaign'] ?? null,
                'consent_data_capture' => (bool) ($consent ?? $ctx['consent_data_capture'] ?? false),
                'consent_at'   => $consent ? now() : null,
                'device_type'  => \App\Services\GeoIPService::detectDevice($request->userAgent()),
            ]
        );

        if ($consent === true && !$session->consent_data_capture) {
            $session->update(['consent_data_capture' => true, 'consent_at' => now()]);
        }

        if ($session->visitor_uuid) {
            VisitorProfile::firstOrCreate(
                ['visitor_uuid' => $session->visitor_uuid],
                ['first_seen_at' => now(), 'last_seen_at' => now()]
            )->increment('visits_count', 0);
        }

        return $session;
    }

    private function applyPepaMetaToSession(ChatSession $session, ?array $meta): void
    {
        if (empty($meta)) return;

        $updates = [];

        if (!empty($meta['postura_actual'])) {
            $postura = mb_substr($meta['postura_actual'], 0, 140);
            $updates['postura_actual'] = $postura;
            if (empty($session->postura_inicial)) {
                $updates['postura_inicial'] = $postura;
            }
        }

        if (!empty($meta['cambio_de_opinion']) &&
            in_array($meta['cambio_de_opinion'], ['si', 'no', 'aun_no_evaluable'], true)) {
            $updates['cambio_de_opinion'] = $meta['cambio_de_opinion'];
        }

        if (!empty($meta['region_confirmada']) && empty($session->geo_region)) {
            $updates['geo_region'] = $meta['region_confirmada'];
        }

        if (!empty($updates)) {
            $session->update($updates);
        }
    }

    private function capturePotentialDeclaredData(ChatSession $session, array $declared): void
    {
        if (!$session->consent_data_capture || empty($declared)) return;

        $allowedFields = ['edad','rango_edad','profesion','sexo','distrito','region',
                          'intencion_voto','preocupacion','interes'];

        foreach ($declared as $field => $value) {
            if (!in_array($field, $allowedFields, true)) continue;
            if (empty($value) || !is_scalar($value)) continue;

            CitizenData::create([
                'session_id'   => $session->id,
                'visitor_uuid' => $session->visitor_uuid,
                'field_name'   => $field,
                'field_value'  => mb_substr((string) $value, 0, 200),
                'source'       => 'declared',
                'confidence'   => 1.00,
            ]);
        }
    }
}
