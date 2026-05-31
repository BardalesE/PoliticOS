<?php

namespace App\Services;

use App\Models\AiSetting;
use App\Models\AttackResponse;
use App\Models\CampaignPhoto;
use App\Models\CampaignVideo;
use App\Models\CandidateProfile;
use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\District;
use App\Models\Faq;
use App\Models\KnowledgeDocument;
use App\Models\Proposal;
use App\Models\QuestionCluster;
use App\Models\Topic;
use App\Models\VisitorProfile;
use GuzzleHttp\Client as GuzzleClient;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * PoliticOS AI Service v2 (multi-tenant)
 *
 * Mejoras vs v1:
 *   - System prompt dinámico con placeholders {{candidate_name}}, {{personality.tone}}, etc.
 *   - Detección de ataques ANTES del RAG, inyectando plantilla defensiva.
 *   - Sanitización contra prompt injection.
 *   - RAG con driver swappable (MySQL FULLTEXT | Qdrant).
 *   - Inyección de segmento detectado del visitante.
 *   - Memoria conversacional cross-sesión vía VisitorProfile.
 *   - Detección de divulgación obligatoria ("¿eres el candidato?").
 *
 * NOTA: el nombre "JamesAIService" se mantiene por compatibilidad con código existente.
 * Internamente este servicio funciona para CUALQUIER candidato del tenant activo.
 */
class JamesAIService
{
    private AiSetting $config;
    private CandidateProfile $candidate;
    private EmbeddingsServiceInterface $embeddings;
    private string $systemPromptTemplate;

    public function __construct(EmbeddingsServiceInterface $embeddings)
    {
        $this->config       = AiSetting::current();
        $this->candidate    = CandidateProfile::query()->firstOrFail();
        $this->embeddings   = $embeddings;
        $this->systemPromptTemplate = $this->config->system_prompt ?: $this->defaultPrompt();
    }

    // ─── Punto de entrada (sincrónico) ────────────────────────────────────
    public function respond(string $userMessage, ChatSession $session): array
    {
        $userMessage = $this->sanitize($userMessage);

        $identity = $this->detectIdentityQuestion($userMessage);
        if ($identity) {
            return $identity;
        }

        $topic    = $this->detectTopic($userMessage);
        $district = $this->detectDistrict($userMessage);
        $attack   = $this->detectAttack($userMessage);

        $context  = $this->buildContext($topic, $district, $userMessage, $attack);
        $history  = $this->getConversationHistory($session);
        $segment  = $this->resolveSegment($session);

        $rawReply = $this->callAI($userMessage, $context, $history, $segment, $attack, $session, $topic);

        if (trim($rawReply) === '__AI_RESTING__') {
            return $this->buildRestingResponse($topic, $district);
        }

        $parsed = $this->parseAIResponse($rawReply);

        $mediaRequest = $this->detectMediaRequest($userMessage);
        $media = $mediaRequest
            ? $this->resolveMediaFeatured($topic, $district, $userMessage)
            : $this->resolveMedia($topic, $district);
        $media = array_merge($media, $this->mediaFromSources($parsed['pepa_metadata']['fuentes_citadas'] ?? []));

        if ($attack) {
            AttackResponse::where('id', $attack['id'])->increment('times_used');
        }

        return [
            'reply'           => $parsed['reply'],
            'topic'           => $parsed['pepa_metadata']['tema_dominante'] ?? $topic,
            'media'           => $media,
            'attack_detected' => $attack !== null,
            'attack_category' => $attack['category'] ?? null,
            'pepa_metadata'   => $parsed['pepa_metadata'],
            'nonsense'        => false,
            'blocked'         => false,
            'quickReplies'    => [],
        ];
    }

    // ─── Punto de entrada (streaming SSE) ─────────────────────────────────
    public function respondStream(string $userMessage, ChatSession $session, callable $onChunk): array
    {
        $userMessage = $this->sanitize($userMessage);

        $identity = $this->detectIdentityQuestion($userMessage);
        if ($identity) {
            $onChunk($identity['reply']);
            return [
                'topic'          => $identity['topic'],
                'media'          => $identity['media'],
                'attack_detected'=> false,
                'pepa_metadata'  => null,
            ];
        }

        $topic    = $this->detectTopic($userMessage);
        $district = $this->detectDistrict($userMessage);
        $attack   = $this->detectAttack($userMessage);
        $context  = $this->buildContext($topic, $district, $userMessage, $attack);
        $history  = $this->getConversationHistory($session);
        $segment  = $this->resolveSegment($session);

        // Bufferizamos la respuesta cruda para poder parsear JSON antes de enviar al usuario
        $rawBuffer = '';
        $this->callAIStream($userMessage, $context, $history, $segment, $attack, $session, $topic,
            function (string $chunk) use (&$rawBuffer) {
                $rawBuffer .= $chunk;
            }
        );

        // IA sin tokens / todos los providers fallaron → respuesta de descanso
        if (trim($rawBuffer) === '__AI_RESTING__') {
            $resting = $this->buildRestingResponse($topic, $district);
            foreach (str_split($resting['reply'], 30) as $chunk) {
                $onChunk($chunk);
            }
            return $resting;
        }

        $parsed = $this->parseAIResponse($rawBuffer);

        // Enviar el texto ya limpio al cliente en trozos de ~30 chars
        foreach (str_split($parsed['reply'], 30) as $chunk) {
            $onChunk($chunk);
        }

        $mediaRequest = $this->detectMediaRequest($userMessage);
        $media = $mediaRequest
            ? $this->resolveMediaFeatured($topic, $district, $userMessage)
            : $this->resolveMedia($topic, $district);
        $media = array_merge($media, $this->mediaFromSources($parsed['pepa_metadata']['fuentes_citadas'] ?? []));

        if ($attack) {
            AttackResponse::where('id', $attack['id'])->increment('times_used');
        }

        return [
            'topic'           => $parsed['pepa_metadata']['tema_dominante'] ?? $topic,
            'media'           => $media,
            'attack_detected' => $attack !== null,
            'attack_category' => $attack['category'] ?? null,
            'pepa_metadata'   => $parsed['pepa_metadata'],
            'nonsense'        => false,
            'blocked'         => false,
            'quickReplies'    => [],
        ];
    }

    // ─── SANITIZACIÓN ─────────────────────────────────────────────────────
    private function sanitize(string $msg): string
    {
        // Detectar intentos de prompt injection más comunes
        $injectionPatterns = [
            '/ignor[ae]?\s+(todo|las?\s+)?(instrucciones|reglas|anterior)/iu',
            '/(act[uú]a|hazte\s+pasar|pretende\s+ser|fingir\s+ser)\s+(como|por)/iu',
            '/system\s*(prompt|message|instruction)/i',
            '/\[INST\]|\<\|.*?\|\>|\<\|im_(start|end)\|\>/',
            '/forget\s+(everything|all|previous)/i',
            '/eres\s+ahora/iu',
        ];

        foreach ($injectionPatterns as $p) {
            if (preg_match($p, $msg)) {
                Log::info('Prompt injection attempt blocked', ['snippet' => substr($msg, 0, 100)]);
                return '[FILTRADO: intento de inyección detectado] ' . preg_replace($p, '***', $msg);
            }
        }

        // Trim agresivo de longitud
        return mb_substr(trim($msg), 0, 2000);
    }

    // ─── DETECCIÓN DE IDENTIDAD ("¿eres el candidato?") ──────────────────
    private function detectIdentityQuestion(string $msg): ?array
    {
        $msg = mb_strtolower($msg);
        $first = mb_strtolower(explode(' ', $this->candidate->name)[0] ?? '');

        $patterns = [
            '/\beres\s+(tu\s+)?'.preg_quote($first, '/').'\b/u',
            '/\beres\s+(el|la)\s+candidat[oa]\b/u',
            '/\bhablo\s+con\s+(el|la)?\s*'.preg_quote($first, '/').'\b/u',
            '/\best[áa]s?\s+(en\s+)?vivo\b/u',
            '/\beres\s+real\b/u',
            '/\beres\s+humano\b/u',
            '/\beres\s+(una?)?\s*ia\b/u',
            '/\beres\s+un\s+bot\b/u',
        ];

        foreach ($patterns as $p) {
            if (preg_match($p, $msg)) {
                $name = $this->candidate->name;
                $fname = explode(' ', $name)[0];
                return [
                    'reply' => "Soy el asistente virtual oficial de {$name}, entrenado con su plan de gobierno, propuestas y declaraciones públicas. No soy {$fname} en persona, pero conozco a fondo lo que propone. ¿Hay algo específico que quieras saber sobre sus planes?",
                    'topic' => null,
                    'media' => [],
                ];
            }
        }
        return null;
    }

    // ─── DETECCIÓN DE ATAQUES ─────────────────────────────────────────────
    private function detectAttack(string $msg): ?array
    {
        $msg = mb_strtolower($msg);
        $map = AttackResponse::detectionMap();

        foreach ($map as $resp) {
            foreach ($resp['keywords'] as $kw) {
                if (str_contains($msg, mb_strtolower($kw))) {
                    return $resp;
                }
            }
        }
        return null;
    }

    // ─── DETECCIÓN DE TEMA/DISTRITO ───────────────────────────────────────
    private function detectTopic(string $msg): ?string
    {
        $msg = mb_strtolower($msg);
        foreach (Topic::activeKeywordsMap() as $topic => $kws) {
            foreach ((array) $kws as $kw) {
                if (str_contains($msg, mb_strtolower($kw))) return $topic;
            }
        }
        return null;
    }

    private function detectDistrict(string $msg): ?string
    {
        $msg = mb_strtolower($msg);
        foreach (District::activeKeywordsMap() as $district => $kws) {
            foreach ((array) $kws as $kw) {
                if (str_contains($msg, mb_strtolower($kw))) return $district;
            }
        }
        return null;
    }

    // ─── SEGMENTO DEL VISITANTE ───────────────────────────────────────────
    private function resolveSegment(ChatSession $session): array
    {
        $seg = [
            'segment'   => $session->inferred_segment ?? 'desconocido',
            'intention' => $session->inferred_intention ?? null,
            'concerns'  => [],
            'district'  => null,
        ];

        if ($session->visitor_uuid) {
            $profile = VisitorProfile::where('visitor_uuid', $session->visitor_uuid)->first();
            if ($profile) {
                $seg['segment']   = $profile->inferred_segment   ?? $seg['segment'];
                $seg['intention'] = $profile->inferred_intention ?? $seg['intention'];
                $seg['concerns']  = $profile->detected_concerns  ?? [];
                $seg['district']  = $profile->inferred_district;
            }
        }
        return $seg;
    }

    // ─── HISTORIAL CONVERSACIONAL ─────────────────────────────────────────
    private function getConversationHistory(ChatSession $session): array
    {
        $rawMessages = ChatMessage::where('session_id', $session->id)
            ->orderBy('created_at')
            ->get();

        $history = [];
        $lastRole = null;
        foreach ($rawMessages as $m) {
            $role = $m->role === 'user' ? 'user' : 'assistant';
            if ($role === $lastRole) continue;
            $history[] = ['role' => $role, 'content' => $m->content];
            $lastRole = $role;
        }
        if (!empty($history) && end($history)['role'] === 'user') {
            array_pop($history);
        }
        return array_slice($history, -8);
    }

    // ─── CONSTRUCCIÓN DE CONTEXTO RAG ─────────────────────────────────────
    private function buildContext(?string $topic, ?string $district, string $userMessage, ?array $attack): string
    {
        $parts = [];

        // Si hay ataque, inyectamos la plantilla defensiva primero
        if ($attack) {
            $parts[] = "DIRECTRIZ DEFENSIVA (el ciudadano lanzó un ataque categoría '{$attack['category']}'):";
            $parts[] = "Sigue esta estrategia de respuesta: {$attack['template']}";
            if (!empty($attack['deflection_topic'])) {
                $parts[] = "Después de defender, redirige al tema: {$attack['deflection_topic']}";
            }
            $parts[] = '';
        }

        // Propuestas relevantes
        $proposals = Proposal::query()
            ->when($topic,    fn($q) => $q->where('topic', $topic))
            ->when($district, fn($q) => $q->where('district', 'like', "%{$district}%"))
            ->where('status', '!=', 'completada')
            ->limit(4)->get();

        if ($proposals->isNotEmpty()) {
            $parts[] = 'PROPUESTAS DEL CANDIDATO:';
            foreach ($proposals as $p) {
                $budget = $p->budget   ? ' (presupuesto: S/ '.number_format($p->budget, 0, ',', '.').')' : '';
                $loc    = $p->district ? " — {$p->district}" : '';
                $status = $p->status === 'en_curso' ? ' [EN EJECUCIÓN]' : '';
                $parts[] = "• {$p->title}{$loc}{$budget}{$status}: {$p->description}";
            }
        }

        // FAQs
        $faqs = Faq::query()
            ->when($topic, fn($q) => $q->where('topic', $topic))
            ->limit(3)->get();

        if ($faqs->isNotEmpty()) {
            $parts[] = "\nPREGUNTAS FRECUENTES PRE-RESUELTAS:";
            foreach ($faqs as $f) {
                $parts[] = "P: {$f->question}\nR: {$f->answer}";
            }
        }

        // Aprendizaje acumulado: patrones de preguntas frecuentes de ciudadanos
        $clusters = QuestionCluster::query()
            ->when($topic, fn($q) => $q->where('topic', $topic))
            ->orderByDesc('message_count')
            ->limit(3)
            ->get();

        if ($clusters->isNotEmpty()) {
            $parts[] = "\nPATRONES DE PREGUNTAS FRECUENTES (lo que más preguntan ciudadanos — anticipa y profundiza en estos temas):";
            foreach ($clusters as $c) {
                $parts[] = "• \"{$c->cluster_label}\" ({$c->message_count} ciudadanos preguntaron esto). Ejemplo: {$c->representative_question}";
            }
        }

        // RAG: documentos relevantes vía driver de embeddings
        $docs = $this->embeddings->search($userMessage, 4, $topic ? ['topic' => $topic] : []);

        if (!empty($docs)) {
            $parts[] = "\nDOCUMENTACIÓN OFICIAL (plan de gobierno, entrevistas, declaraciones):";
            foreach ($docs as $d) {
                $title = $d['title'] ?: 'Documento';
                $excerpt = mb_substr($d['excerpt'], 0, 2200);
                $parts[] = "=== {$title} ===\n{$excerpt}";
            }
        }

        return implode("\n", $parts);
    }

    // ─── CONSTRUCCIÓN DEL SYSTEM PROMPT FINAL ─────────────────────────────
    private function buildSystemPrompt(string $context, array $segment, ?array $attack,
                                       ChatSession $session, ?string $topic): string
    {
        $traits   = is_array($this->candidate->personality_traits) ? $this->candidate->personality_traits : [];
        $phrases  = $this->candidate->signature_phrases ?? [];
        $forbidden = $this->candidate->forbidden_topics ?? [];

        $replacements = [
            // Placeholders del candidato (modo single-candidate)
            '{{candidate_name}}'    => $this->candidate->name,
            '{{candidate_first}}'   => explode(' ', $this->candidate->name)[0],
            '{{party}}'             => $this->candidate->party,
            '{{office}}'            => $this->candidate->title,
            '{{location}}'          => $this->candidate->location,
            '{{tagline}}'           => $this->candidate->tagline ?? '',
            '{{slogan}}'            => $this->candidate->campaign_slogan ?? '',
            '{{tone}}'              => $traits['tone'] ?? 'cercano y directo',
            '{{voice_style}}'       => $traits['voice_style'] ?? 'peruano natural',
            '{{attack_style}}'      => $this->candidate->attack_response_style ?? 'firme pero respetuoso',
            '{{signature_phrases}}' => is_array($phrases) ? implode(', ', $phrases) : '',
            '{{forbidden_topics}}'  => is_array($forbidden) ? implode(', ', $forbidden) : 'ninguno',
            '{{biography}}'         => mb_substr($this->candidate->biography_long ?? $this->candidate->bio ?? '', 0, 1500),
            '{{detected_segment}}'  => $segment['segment'],
            '{{detected_concerns}}' => is_array($segment['concerns']) ? implode(', ', $segment['concerns']) : '',
            '{{detected_district}}' => $segment['district'] ?? 'no detectado',
            // Placeholders del prompt Pepa (asistente cívico)
            '{{region}}'            => $session->geo_region ?? $segment['district'] ?? 'Perú',
            '{{distrito}}'          => $segment['district'] ?? $session->geo_city ?? 'no detectado',
            '{{tema}}'              => $topic ?? 'no definido',
            '{{candidatos}}'        => $this->candidate->name,
            '{{turno}}'             => (string) ($session->messages_count ?? 0),
            '{{postura_inicial}}'   => $session->postura_inicial ?? 'no registrada',
        ];

        $prompt = strtr($this->systemPromptTemplate, $replacements);

        // Capacidad de media — fija, no puede ser anulada por prompt custom en BD
        $prompt .= "\n\n⚠️ CAPACIDAD DE MEDIA (OBLIGATORIO): Esta plataforma adjunta imágenes, videos y PDFs automáticamente debajo de tu mensaje. NUNCA digas \"no puedo mostrar imágenes\" — eso es incorrecto. Cuando el ciudadano pida fotos, obras, imágenes o videos: confirma con entusiasmo que sí los adjuntas (\"Claro, aquí te muestro...\", \"Te adjunto las fotos...\") porque el sistema los agrega automáticamente. Habla de las imágenes como si ya las estuviera viendo.";

        if (!empty($context)) {
            $prompt .= "\n\n--- CONTEXTO DISPONIBLE PARA ESTA RESPUESTA ---\n{$context}\n--- FIN CONTEXTO ---";
        }

        if ($attack) {
            $prompt .= "\n\n⚠️ ALERTA: El ciudadano hizo una pregunta/ataque sobre tema sensible. Aplica la estrategia defensiva indicada arriba. NO te pongas a la defensiva ni ataques de vuelta.";
        }

        return $prompt;
    }

    // ─── LLAMADA A LA IA ─────────────────────────────────────────────────
    private function callAI(string $userMessage, string $context, array $history, array $segment,
                            ?array $attack, ChatSession $session, ?string $topic): string
    {
        $providers = array_unique(array_filter([
            $this->config->provider,
            $this->config->fallback_provider,
            $this->getLastResortProvider(),
        ]));

        $systemPrompt = $this->buildSystemPrompt($context, $segment, $attack, $session, $topic);

        foreach ($providers as $provider) {
            try {
                $reply = $this->callProvider($provider, $userMessage, $systemPrompt, $history);
                if (!empty($reply)) return $reply;
            } catch (\Throwable $e) {
                Log::warning("AI provider '{$provider}' failed", ['error' => $e->getMessage()]);
            }
        }

        Log::error('All AI providers failed');
        return '__AI_RESTING__';
    }

    private function callProvider(string $provider, string $userMessage, string $systemPrompt, array $history): string
    {
        return match ($provider) {
            'claude' => $this->callClaude($userMessage, $systemPrompt, $history),
            'openai' => $this->callOpenCompatible(
                $userMessage, $systemPrompt, $history,
                'https://api.openai.com/v1/chat/completions',
                config('services.ai.openai_key'),
                config('services.ai.openai_model', 'gpt-4o-mini')
            ),
            default => $this->callOpenCompatible(
                $userMessage, $systemPrompt, $history,
                'https://api.groq.com/openai/v1/chat/completions',
                config('services.ai.groq_key'),
                $this->config->provider === 'groq'
                    ? $this->config->model
                    : config('services.ai.groq_model', 'llama-3.3-70b-versatile')
            ),
        };
    }

    private function getLastResortProvider(): ?string
    {
        $all = ['groq','claude','openai'];
        $used = array_filter([$this->config->provider, $this->config->fallback_provider]);
        return array_values(array_diff($all, $used))[0] ?? null;
    }

    private function callOpenCompatible(string $userMessage, string $systemPrompt, array $history,
                                        string $url, string $apiKey, string $model): string
    {
        $messages = [['role' => 'system', 'content' => $systemPrompt]];
        $messages = array_merge($messages, $history);
        $messages[] = ['role' => 'user', 'content' => $userMessage];

        $response = Http::timeout(30)->withToken($apiKey)->post($url, [
            'model'       => $model,
            'temperature' => $this->config->temperature,
            'max_tokens'  => $this->config->max_tokens,
            'messages'    => $messages,
        ]);

        if (!$response->ok()) {
            throw new \RuntimeException("HTTP {$response->status()}: ".$response->body());
        }

        return $response->json('choices.0.message.content') ?? '';
    }

    private function callClaude(string $userMessage, string $systemPrompt, array $history): string
    {
        $messages = $history;
        $messages[] = ['role' => 'user', 'content' => $userMessage];

        $model = $this->config->provider === 'claude'
            ? $this->config->model
            : config('services.ai.claude_model', 'claude-haiku-4-5-20251001');

        $response = Http::timeout(30)->withHeaders([
            'x-api-key'         => config('services.ai.claude_key'),
            'anthropic-version' => '2023-06-01',
            'content-type'      => 'application/json',
        ])->post('https://api.anthropic.com/v1/messages', [
            'model'      => $model,
            'max_tokens' => $this->config->max_tokens,
            'system'     => $systemPrompt,
            'messages'   => $messages,
        ]);

        if (!$response->ok()) {
            throw new \RuntimeException("Claude HTTP {$response->status()}: ".$response->body());
        }

        return $response->json('content.0.text') ?? '';
    }

    // ─── STREAMING ───────────────────────────────────────────────────────
    private function callAIStream(string $userMessage, string $context, array $history,
                                  array $segment, ?array $attack, ChatSession $session,
                                  ?string $topic, callable $onChunk): void
    {
        $providers = array_unique(array_filter([
            $this->config->provider,
            $this->config->fallback_provider,
            $this->getLastResortProvider(),
        ]));

        $systemPrompt = $this->buildSystemPrompt($context, $segment, $attack, $session, $topic);

        foreach ($providers as $provider) {
            try {
                $this->callProviderStream($provider, $userMessage, $systemPrompt, $history, $onChunk);
                return;
            } catch (\Throwable $e) {
                Log::warning("Streaming provider '{$provider}' failed", ['error' => $e->getMessage()]);
            }
        }

        $onChunk('__AI_RESTING__');
    }

    private function callProviderStream(string $provider, string $userMessage, string $systemPrompt,
                                        array $history, callable $onChunk): void
    {
        match ($provider) {
            'claude' => $this->streamClaude($userMessage, $systemPrompt, $history, $onChunk),
            'openai' => $this->streamOpenCompatible(
                $userMessage, $systemPrompt, $history, $onChunk,
                'https://api.openai.com/v1/chat/completions',
                config('services.ai.openai_key'),
                config('services.ai.openai_model', 'gpt-4o-mini')
            ),
            default => $this->streamOpenCompatible(
                $userMessage, $systemPrompt, $history, $onChunk,
                'https://api.groq.com/openai/v1/chat/completions',
                config('services.ai.groq_key'),
                $this->config->provider === 'groq'
                    ? $this->config->model
                    : config('services.ai.groq_model', 'llama-3.3-70b-versatile')
            ),
        };
    }

    private function streamOpenCompatible(string $userMessage, string $systemPrompt, array $history,
                                          callable $onChunk, string $url, string $apiKey, string $model): void
    {
        $messages = [['role' => 'system', 'content' => $systemPrompt]];
        $messages = array_merge($messages, $history);
        $messages[] = ['role' => 'user', 'content' => $userMessage];

        $client = new GuzzleClient(['timeout' => 60]);
        $response = $client->post($url, [
            'headers' => [
                'Authorization' => "Bearer {$apiKey}",
                'Content-Type'  => 'application/json',
                'Accept'        => 'text/event-stream',
            ],
            'body' => json_encode([
                'model' => $model,
                'temperature' => $this->config->temperature,
                'max_tokens'  => $this->config->max_tokens,
                'messages'    => $messages,
                'stream'      => true,
            ]),
            'stream' => true,
        ]);

        $this->processSSEStream($response->getBody(), $onChunk, function ($line) {
            if (!str_starts_with($line, 'data: ') || $line === 'data: [DONE]') return null;
            $payload = json_decode(substr($line, 6), true);
            return $payload['choices'][0]['delta']['content'] ?? null;
        });
    }

    private function streamClaude(string $userMessage, string $systemPrompt, array $history, callable $onChunk): void
    {
        $messages = $history;
        $messages[] = ['role' => 'user', 'content' => $userMessage];

        $model = $this->config->provider === 'claude'
            ? $this->config->model
            : config('services.ai.claude_model', 'claude-haiku-4-5-20251001');

        $client = new GuzzleClient(['timeout' => 60]);
        $response = $client->post('https://api.anthropic.com/v1/messages', [
            'headers' => [
                'x-api-key'         => config('services.ai.claude_key'),
                'anthropic-version' => '2023-06-01',
                'Content-Type'      => 'application/json',
                'Accept'            => 'text/event-stream',
            ],
            'body' => json_encode([
                'model' => $model,
                'max_tokens' => $this->config->max_tokens,
                'system' => $systemPrompt,
                'messages' => $messages,
                'stream' => true,
            ]),
            'stream' => true,
        ]);

        $this->processSSEStream($response->getBody(), $onChunk, function ($line) {
            if (!str_starts_with($line, 'data: ')) return null;
            $payload = json_decode(substr($line, 6), true);
            if (($payload['type'] ?? '') !== 'content_block_delta') return null;
            return $payload['delta']['text'] ?? null;
        });
    }

    private function processSSEStream($body, callable $onChunk, callable $extractor): void
    {
        $buffer = '';
        while (!$body->eof()) {
            $buffer .= $body->read(512);
            while (($pos = strpos($buffer, "\n")) !== false) {
                $line = trim(substr($buffer, 0, $pos));
                $buffer = substr($buffer, $pos + 1);
                if (empty($line)) continue;
                $chunk = $extractor($line);
                if ($chunk !== null && $chunk !== '') $onChunk($chunk);
            }
        }
    }

    // ─── RESPUESTA DE DESCANSO (tokens agotados / providers caídos) ──────
    private function buildRestingResponse(?string $topic, ?string $district): array
    {
        $first   = explode(' ', $this->candidate->name)[0];
        $tagline = $this->candidate->tagline ?? $this->candidate->campaign_slogan ?? '';

        $proposals = Proposal::where('status', '!=', 'completada')->limit(5)->get();
        $propLines = $proposals->map(
            fn($p) => '• ' . $p->title . ': ' . mb_substr($p->description, 0, 90) . '…'
        )->implode("\n");

        $message = "¡Un momento paisano, mi cerebrito digital necesita un pequeño descanso! ☕\n\n"
            . "Pero no te vas con las manos vacías — aquí tienes todo sobre {$first}:\n\n"
            . ($tagline ? "\"{$tagline}\"\n\n" : '')
            . "PROPUESTAS PRINCIPALES:\n{$propLines}\n\n"
            . "👇 Abajo tienes fotos de obras, videos y documentos oficiales para explorar mientras vuelvo. ¡No tardo!";

        return [
            'reply'           => $message,
            'topic'           => $topic,
            'media'           => $this->resolveAllContent(),
            'attack_detected' => false,
            'attack_category' => null,
            'pepa_metadata'   => null,
            'nonsense'        => false,
            'blocked'         => false,
            'ai_resting'      => true,
            'quickReplies'    => [],
        ];
    }

    private function resolveAllContent(): array
    {
        $media = [];

        // ── 1. Documentos de base de conocimiento (primero, siempre visibles) ──
        foreach (KnowledgeDocument::orderByDesc('created_at')->limit(3)->get() as $d) {
            if ($d->file_url) {
                $media[] = ['type' => 'pdf', 'url' => $d->file_url,
                            'title' => $d->title ?: 'Documento oficial'];
            }
        }

        // ── 2. Propuestas con documento PDF ───────────────────────────────
        foreach (Proposal::whereNotNull('document_url')->limit(2)->get() as $p) {
            $media[] = ['type' => 'pdf', 'url' => $p->document_url,
                        'title' => "Propuesta: {$p->title}"];
        }

        // ── 3. Videos: CampaignVideo + Video hasta 3 en total ─────────────
        $videoCount = 0;
        foreach (CampaignVideo::orderByDesc('created_at')->limit(3)->get() as $v) {
            $media[] = ['type' => 'video', 'url' => $v->url,
                        'title' => $v->title ?: 'Video de campaña', 'thumbnail' => $v->thumbnail];
            $videoCount++;
        }
        $needed = 3 - $videoCount;
        if ($needed > 0) {
            foreach (\App\Models\Video::orderByDesc('created_at')->limit($needed)->get() as $v) {
                $media[] = ['type' => 'video', 'url' => $v->url,
                            'title' => $v->title, 'thumbnail' => $v->thumbnail];
            }
        }

        // ── 4. Fotos de campaña ───────────────────────────────────────────
        foreach (CampaignPhoto::orderByDesc('created_at')->limit(3)->get() as $p) {
            $media[] = ['type' => 'image', 'url' => $p->url, 'title' => $p->title ?: 'Foto de campaña'];
        }

        return $media;
    }

    // ─── DETECCIÓN DE NONSENSE / TEXTO ININTELIGIBLE ─────────────────────
    private function detectNonsense(string $msg): bool
    {
        $clean = preg_replace('/[\s\W]/u', '', mb_strtolower($msg));
        $len = mb_strlen($clean);
        if ($len < 5) return false;

        // Ratio de vocales: menos del 15% → nonsense
        preg_match_all('/[aeiouáéíóúü]/u', $clean, $vm);
        if ((count($vm[0]) / $len) < 0.15) return true;

        // 6+ consonantes seguidas sin vocal
        if (preg_match('/[bcdfghjklmnpqrstvwxyz]{6,}/iu', $clean)) return true;

        // Carácter repetido 4+ veces
        if (preg_match('/(.)\1{3,}/u', $clean)) return true;

        return false;
    }

    // ─── TÉRMINOS DE BÚSQUEDA PARA GALERÍA ───────────────────────────────
    private function extractGalleryTerms(string $msg, ?string $topic): array
    {
        $terms = $topic ? [$topic] : [];
        $msg   = mb_strtolower($msg);

        $map = [
            ['kw' => ['obra', 'constru', 'infraestruc', 'proyecto', 'ejecut', 'realiz'],
             'terms' => ['obra', 'infraestructura', 'proyecto']],
            ['kw' => ['agua', 'saneamiento', 'desague', 'canal', 'riego'],
             'terms' => ['agua', 'saneamiento']],
            ['kw' => ['carretera', 'pista', 'vía', 'via ', 'camino', 'trocha', 'asfalt'],
             'terms' => ['carretera', 'vial', 'camino']],
            ['kw' => ['salud', 'hospital', 'posta', 'clinic', 'medic'],
             'terms' => ['salud', 'hospital', 'posta']],
            ['kw' => ['deporte', 'losa', 'estadio', 'polidep', 'cancha'],
             'terms' => ['deporte', 'losa', 'deportiv']],
            ['kw' => ['educac', 'colegio', 'escuela', 'aula', 'escolar'],
             'terms' => ['educacion', 'colegio', 'escuela']],
            ['kw' => ['campaña', 'mitin', 'evento', 'actividad'],
             'terms' => ['campaña', 'evento']],
            ['kw' => ['logro', 'avance', 'entrega', 'hiciste', 'hizo', 'gestion', 'gestión', 'alcalde'],
             'terms' => ['obra', 'logro', 'avance', 'general']],
        ];

        foreach ($map as $entry) {
            foreach ($entry['kw'] as $kw) {
                if (str_contains($msg, $kw)) {
                    $terms = array_merge($terms, $entry['terms']);
                    break;
                }
            }
        }

        return array_unique(array_filter($terms));
    }

    // ─── DETECCIÓN DE SOLICITUD DE MEDIA ────────────────────────────────
    private function detectMediaRequest(string $msg): bool
    {
        $msg = mb_strtolower($msg);
        $keywords = [
            'muéstrame', 'muestrame', 'mostrar', 'ver imagen', 'ver foto',
            'ver obra', 'ver video', 'quiero ver', 'puedes mostrar',
            'foto', 'imagen', 'imágenes', 'imagenes', 'fotos',
            'obras', 'evidencia', 'galería', 'galeria', 'adjunta',
            'adjúntame', 'adjuntame', 'qué hiciste', 'que hiciste',
            'muestra las', 'dame fotos', 'dame imágenes',
        ];
        foreach ($keywords as $kw) {
            if (str_contains($msg, mb_strtolower($kw))) return true;
        }
        return false;
    }

    // ─── MEDIA CUANDO EL USUARIO PIDE VER IMÁGENES/OBRAS ────────────────
    private function resolveMediaFeatured(?string $topic, ?string $district, string $userMessage = ''): array
    {
        $media = [];
        $searchTerms = $this->extractGalleryTerms($userMessage, $topic);

        // ── Imágenes: busca por términos en la galería, fallback a las más recientes ──
        $photoBase = CampaignPhoto::orderByDesc('created_at');
        $photos = collect();

        if (!empty($searchTerms)) {
            $photos = (clone $photoBase)->where(function ($q) use ($searchTerms) {
                foreach ($searchTerms as $term) {
                    $q->orWhere('category', 'like', "%{$term}%")
                      ->orWhere('title',    'like', "%{$term}%");
                }
            })->limit(4)->get();
        }

        if ($photos->isEmpty()) {
            $photos = $photoBase->limit(4)->get();
        }

        foreach ($photos as $p) {
            $media[] = ['type' => 'image', 'url' => $p->url, 'title' => $p->title ?: 'Foto de campaña'];
        }

        // Si no hay fotos de campaña, usar imágenes de propuestas
        if (empty($media)) {
            $propImgs = Proposal::whereNotNull('image')
                ->when($topic,    fn($q) => $q->where('topic', $topic))
                ->when($district, fn($q) => $q->where('district', 'like', "%{$district}%"))
                ->limit(3)->get();
            if ($propImgs->isEmpty()) {
                $propImgs = Proposal::whereNotNull('image')->limit(3)->get();
            }
            foreach ($propImgs as $p) {
                $media[] = ['type' => 'image', 'url' => $p->image, 'title' => $p->title];
            }
        }

        // ── Videos: CampaignVideo + Video hasta 2 en total ───────────────
        $videoCount = 0;
        foreach (CampaignVideo::orderByDesc('created_at')->limit(2)->get() as $v) {
            $media[] = ['type' => 'video', 'url' => $v->url,
                        'title' => $v->title ?: 'Video de campaña', 'thumbnail' => $v->thumbnail];
            $videoCount++;
        }
        $needed = 2 - $videoCount;
        if ($needed > 0) {
            $vidQuery = \App\Models\Video::orderByDesc('created_at');
            if ($topic) {
                $filtered = (clone $vidQuery)->where('topic', $topic)->limit($needed)->get();
                $vids = $filtered->isNotEmpty() ? $filtered : $vidQuery->limit($needed)->get();
            } else {
                $vids = $vidQuery->limit($needed)->get();
            }
            foreach ($vids as $v) {
                $media[] = ['type' => 'video', 'url' => $v->url,
                            'title' => $v->title, 'thumbnail' => $v->thumbnail];
            }
        }

        // ── Documentos de base de conocimiento ───────────────────────────
        $docQuery = KnowledgeDocument::orderByDesc('created_at');
        if ($topic) {
            $filteredDocs = (clone $docQuery)->where('topic', $topic)->limit(2)->get();
            $docs = $filteredDocs->isNotEmpty() ? $filteredDocs : $docQuery->limit(2)->get();
        } else {
            $docs = $docQuery->limit(2)->get();
        }
        foreach ($docs as $d) {
            if ($d->file_url) {
                $media[] = ['type' => 'pdf', 'url' => $d->file_url,
                            'title' => $d->title ?: 'Documento oficial'];
            }
        }

        // ── Propuestas con documento PDF ──────────────────────────────────
        $propDoc = Proposal::whereNotNull('document_url')
            ->when($topic,    fn($q) => $q->where('topic', $topic))
            ->when($district, fn($q) => $q->where('district', 'like', "%{$district}%"))
            ->first();
        if (!$propDoc) {
            $propDoc = Proposal::whereNotNull('document_url')->first();
        }
        if ($propDoc) {
            $media[] = ['type' => 'pdf', 'url' => $propDoc->document_url,
                        'title' => "Propuesta: {$propDoc->title}"];
        }

        return $media;
    }

    // ─── MEDIA RELACIONADA ───────────────────────────────────────────────
    private function resolveMedia(?string $topic, ?string $district): array
    {
        if (!$topic && !$district) return [];

        $media = [];

        // Foto de la galería del admin para el topic/categoría
        if ($topic) {
            $campPhoto = CampaignPhoto::where('category', $topic)
                ->orderByDesc('created_at')->first();
            if ($campPhoto) {
                $media[] = [
                    'type'  => 'image',
                    'url'   => $campPhoto->url,
                    'title' => $campPhoto->title ?: 'Foto de campaña',
                ];
            }
        }

        // Propuesta con imagen (si no hay foto de campaña para este topic)
        if (!array_filter($media, fn($m) => $m['type'] === 'image')) {
            $imgProposal = Proposal::query()
                ->when($topic,    fn($q) => $q->where('topic', $topic))
                ->when($district, fn($q) => $q->where('district', 'like', "%{$district}%"))
                ->whereNotNull('image')->first();

            if ($imgProposal) {
                $media[] = ['type' => 'image', 'url' => $imgProposal->image, 'title' => $imgProposal->title];
            }
        }

        // Propuesta con documento PDF
        $proposal = Proposal::query()
            ->when($topic,    fn($q) => $q->where('topic', $topic))
            ->when($district, fn($q) => $q->where('district', 'like', "%{$district}%"))
            ->whereNotNull('document_url')->first();

        if ($proposal) {
            $media[] = ['type'=>'pdf','url'=>$proposal->document_url,'title'=>"Ver propuesta: {$proposal->title}"];
        }

        $doc = KnowledgeDocument::where('is_active', true)
            ->when($topic, fn($q) => $q->where('topic', $topic))->first();

        if ($doc) {
            $media[] = ['type'=>'pdf','url'=>$doc->file_url,'title'=>$doc->title];
        }

        $video = \App\Models\Video::query()
            ->when($topic, fn($q) => $q->where('topic', $topic))->first();

        if ($video) {
            $media[] = ['type'=>'video','url'=>$video->url,'title'=>$video->title,'thumbnail'=>$video->thumbnail];
        }

        return $media;
    }

    // ─── PARSEO DEL OUTPUT ESTRUCTURADO (Pepa JSON) ──────────────────────
    private function parseAIResponse(string $raw): array
    {
        $clean = trim($raw);

        // Eliminar fences de markdown si la IA los añade
        if (preg_match('/```(?:json)?\s*(\{.*\})\s*```/s', $clean, $m)) {
            $clean = trim($m[1]);
        }

        $decoded = json_decode($clean, true);

        if (json_last_error() === JSON_ERROR_NONE && isset($decoded['respuesta_usuario'])) {
            return [
                'reply'         => trim($decoded['respuesta_usuario']),
                'pepa_metadata' => $decoded['metadata_interna'] ?? null,
            ];
        }

        // El prompt no es Pepa o la IA respondió en texto plano — pasa tal cual
        return ['reply' => $raw, 'pepa_metadata' => null];
    }

    private function mediaFromSources(array $urls): array
    {
        return array_values(array_filter(array_map(function (string $url) {
            if (!filter_var($url, FILTER_VALIDATE_URL)) return null;
            return ['type' => 'link', 'url' => $url, 'title' => 'Fuente verificada'];
        }, $urls)));
    }

    // ─── BIENVENIDA (primer mensaje de la sesión) ────────────────────────
    public function buildWelcomeResponse(): array
    {
        $name   = $this->candidate->name;
        $fname  = explode(' ', $name)[0];
        $party  = $this->candidate->party;
        $slogan = $this->candidate->campaign_slogan ?? $this->candidate->tagline ?? '';

        $reply = "¡Hola! 👋 Soy el asistente virtual oficial de {$name}, candidato a la alcaldía por {$party}.";
        if ($slogan) {
            $reply .= "\n\n\"{$slogan}\"";
        }
        $reply .= "\n\nEstoy aquí para ayudarte a conocer el plan de gobierno de {$fname}. Puedes tocar una opción o escribir tu pregunta directamente:";

        return [
            'reply'           => $reply,
            'topic'           => null,
            'media'           => $this->resolveAllContent(),
            'attack_detected' => false,
            'attack_category' => null,
            'pepa_metadata'   => null,
            'nonsense'        => false,
            'blocked'         => false,
            'quickReplies'    => [
                ['label' => '📋 Ver propuestas',   'value' => 'Muéstrame las propuestas de gobierno'],
                ['label' => '🎬 Fotos y videos',   'value' => 'Muéstrame fotos y videos de campaña'],
                ['label' => '📄 Documentos',        'value' => 'Muéstrame los documentos oficiales'],
                ['label' => '👤 El candidato',      'value' => '¿Quién es el candidato y cuál es su trayectoria?'],
                ['label' => '🗺️ Por distrito',     'value' => '¿Qué propuestas hay para mi distrito?'],
            ],
        ];
    }

    // ─── ADVERTENCIA: mensaje sin sentido (1er aviso) ────────────────────
    public function buildNonsenseWarning(): array
    {
        $name = $this->candidate->name;

        return [
            'reply'           => "⚠️ Tu mensaje no parece relacionado con la campaña.\n\nSoy un asistente especializado en las propuestas de {$name}. Por favor elige una opción o escribe tu pregunta sobre el plan de gobierno.\n\nSi envías otro mensaje fuera de tema, tu sesión será bloqueada temporalmente.",
            'topic'           => null,
            'media'           => [],
            'attack_detected' => false,
            'attack_category' => null,
            'pepa_metadata'   => null,
            'nonsense'        => true,
            'blocked'         => false,
            'quickReplies'    => [
                ['label' => '📋 Ver propuestas',  'value' => 'Muéstrame las propuestas de gobierno'],
                ['label' => '🎬 Fotos y videos',  'value' => 'Muéstrame fotos y videos de campaña'],
                ['label' => '📄 Documentos',       'value' => 'Muéstrame los documentos oficiales'],
                ['label' => '👤 El candidato',     'value' => '¿Quién es el candidato?'],
            ],
        ];
    }

    // ─── SESIÓN BLOQUEADA ────────────────────────────────────────────────
    public function buildBlockedResponse(): array
    {
        return [
            'reply'           => "🔒 Conversación bloqueada\n\nTu sesión fue pausada por mensajes repetidos no relacionados con la campaña.\n\nPara continuar escribe:\n• hola\n• menú\n• inicio",
            'topic'           => null,
            'media'           => [],
            'attack_detected' => false,
            'attack_category' => null,
            'pepa_metadata'   => null,
            'nonsense'        => false,
            'blocked'         => true,
            'quickReplies'    => [],
        ];
    }

    // ─── VERIFICACIÓN PÚBLICA DE NONSENSE ───────────────────────────────
    public function isNonsense(string $msg): bool
    {
        return $this->detectNonsense($msg);
    }

    // ─── PROMPT DEFAULT (si el admin no configuró uno) ───────────────────
    private function defaultPrompt(): string
    {
        return file_get_contents(__DIR__ . '/../../resources/prompts/politicos_v2_prompt.txt')
            ?: 'Eres el asistente virtual del candidato. Hablas en primera persona representando sus propuestas.';
    }
}
