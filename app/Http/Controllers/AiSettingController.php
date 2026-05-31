<?php

namespace App\Http\Controllers;

use App\Models\AiSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class AiSettingController extends Controller
{
    // GET /api/admin/ai-settings
    public function show(): JsonResponse
    {
        return response()->json(AiSetting::current());
    }

    // POST /api/admin/ai-settings/test
    public function test(): JsonResponse
    {
        if (!$this->hasInternet()) {
            return response()->json([
                'internet'  => false,
                'providers' => [],
                'note'      => 'El servidor no tiene acceso a internet. Verifica la conexion de red o el firewall.',
            ]);
        }

        $setting   = AiSetting::current();
        $providers = array_values(array_unique(array_filter([
            $setting->provider,
            $setting->fallback_provider,
        ])));

        if (empty($providers)) {
            return response()->json(['internet' => true, 'providers' => []]);
        }

        $payload = ['max_tokens' => 5, 'messages' => [['role' => 'user', 'content' => 'ok']]];
        $results = [];

        foreach ($providers as $name) {
            $t0      = microtime(true);
            $status  = 'error';
            $message = '';

            try {
                $r = match ($name) {
                    'claude' => Http::timeout(8)->withHeaders([
                        'x-api-key'         => config('services.ai.claude_key') ?? '',
                        'anthropic-version' => '2023-06-01',
                        'content-type'      => 'application/json',
                    ])->post('https://api.anthropic.com/v1/messages', array_merge($payload, [
                        'model' => $setting->provider === 'claude'
                            ? $setting->model
                            : config('services.ai.claude_model', 'claude-haiku-4-5-20251001'),
                    ])),
                    'openai' => Http::timeout(8)
                        ->withToken(config('services.ai.openai_key') ?? '')
                        ->post('https://api.openai.com/v1/chat/completions', array_merge($payload, [
                            'model' => config('services.ai.openai_model', 'gpt-4o-mini'),
                        ])),
                    default => Http::timeout(8)
                        ->withToken(config('services.ai.groq_key') ?? '')
                        ->post('https://api.groq.com/openai/v1/chat/completions', array_merge($payload, [
                            'model' => $setting->provider === 'groq'
                                ? $setting->model
                                : config('services.ai.groq_model', 'llama-3.3-70b-versatile'),
                        ])),
                };

                [$status, $message] = match (true) {
                    $r->ok()             => ['ok',           'Conectado y funcionando'],
                    $r->status() === 429 => ['rate_limited', 'Limite de solicitudes/tokens agotado'],
                    $r->status() === 401 => ['unauthorized', 'API key invalida o no configurada en .env'],
                    $r->status() === 402 => ['no_credits',   'Creditos agotados en la cuenta'],
                    $r->status() === 403 => ['unauthorized', 'Acceso denegado (403)'],
                    default              => ['error',        "Error HTTP {$r->status()}"],
                };
            } catch (\Throwable $e) {
                $status  = 'dns_error';
                $message = $this->friendlyNetError($e->getMessage());
            }

            $results[] = [
                'provider' => $name,
                'status'   => $status,
                'message'  => $message,
                'latency'  => (int) round((microtime(true) - $t0) * 1000),
            ];
        }

        return response()->json(['internet' => true, 'providers' => $results]);
    }

    private function hasInternet(): bool
    {
        try {
            Http::timeout(5)->get('https://1.1.1.1');
            return true;
        } catch (\Throwable) {}
        try {
            Http::timeout(5)->get('https://www.google.com');
            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    private function friendlyNetError(string $msg): string
    {
        if (str_contains($msg, 'Resolving timed out') || str_contains($msg, 'Could not resolve'))
            return 'No se puede resolver el DNS. Verifica que el servidor tenga salida a internet.';
        if (str_contains($msg, 'Connection refused'))
            return 'Conexion rechazada.';
        if (str_contains($msg, 'timed out') || str_contains($msg, 'cURL error 28'))
            return 'Tiempo de espera agotado. Sin acceso al servicio.';
        return substr($msg, 0, 100);
    }

    // PUT /api/admin/ai-settings
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'provider'          => ['sometimes', 'in:groq,claude,openai'],
            'model'             => ['sometimes', 'string', 'max:100'],
            'max_tokens'        => ['sometimes', 'integer', 'between:100,4096'],
            'temperature'       => ['sometimes', 'numeric', 'between:0,1'],
            'fallback_provider' => ['nullable', 'in:groq,claude,openai'],
            'system_prompt'      => ['sometimes', 'string'],
            'chat_subtitle'      => ['nullable', 'string', 'max:100'],
            'chat_btn_text'      => ['nullable', 'string', 'max:100'],
            'chat_btn_image_url' => ['nullable', 'string', 'max:500'],
            'chat_btn_shape'     => ['nullable', 'in:pill,circle'],
            'chat_btn_color'     => ['nullable', 'string', 'max:20'],
            'chat_btn_size'      => ['nullable', 'in:sm,md,lg'],
            'chat_btn_position'  => ['nullable', 'in:bottom-right,bottom-left'],
        ]);

        $setting = AiSetting::current();
        $setting->update($data);

        return response()->json($setting);
    }
}
