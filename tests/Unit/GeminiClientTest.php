<?php

namespace Tests\Unit;

use App\Services\Llm\GeminiClient;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GeminiClientTest extends TestCase
{
    private function client(int $maxRetries = 5): GeminiClient
    {
        return new GeminiClient(apiKey: 'test-key', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', maxRetries: $maxRetries);
    }

    private static function geminiResponse(array $data, int $tokens = 42): array
    {
        return [
            'candidates'    => [['content' => ['parts' => [['text' => json_encode($data)]]]]],
            'usageMetadata' => ['totalTokenCount' => $tokens],
        ];
    }

    public function test_sends_system_and_user_prompt_and_returns_decoded_json(): void
    {
        Http::fake(['*generateContent*' => Http::response(self::geminiResponse(['ok' => true]), 200)]);

        $result = $this->client()->completeJson('system', 'user', 'gemini-2.5-flash');

        $this->assertSame(['ok' => true], $result['data']);
        $this->assertSame(42, $result['tokens']);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'gemini-2.5-flash:generateContent')
                && str_contains($request->url(), 'key=test-key')
                && $request['system_instruction']['parts'][0]['text'] === 'system'
                && $request['contents'][0]['parts'][0]['text'] === 'user'
                && $request['generationConfig']['responseMimeType'] === 'application/json';
        });
    }

    public function test_retries_on_429_respecting_retry_after_header_and_eventually_succeeds(): void
    {
        $attempt = 0;
        Http::fake(function () use (&$attempt) {
            $attempt++;
            if ($attempt < 3) {
                return Http::response([], 429, ['Retry-After' => '1']);
            }

            return Http::response(self::geminiResponse(['ok' => true]), 200);
        });

        $start  = microtime(true);
        $result = $this->client()->completeJson('s', 'u', 'gemini-2.5-flash');
        $elapsed = microtime(true) - $start;

        $this->assertSame(3, $attempt);
        $this->assertSame(['ok' => true], $result['data']);
        $this->assertGreaterThanOrEqual(2.0, $elapsed, 'debe haber esperado el Retry-After entre reintentos');
    }

    public function test_falls_back_to_retry_delay_in_error_body_when_header_is_missing(): void
    {
        $attempt = 0;
        Http::fake(function () use (&$attempt) {
            $attempt++;
            if ($attempt < 2) {
                return Http::response([
                    'error' => ['details' => [['@type' => 'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay' => '1s']]],
                ], 429);
            }

            return Http::response(self::geminiResponse(['ok' => true]), 200);
        });

        $start  = microtime(true);
        $this->client()->completeJson('s', 'u', 'gemini-2.5-flash');
        $elapsed = microtime(true) - $start;

        $this->assertSame(2, $attempt);
        $this->assertGreaterThanOrEqual(1.0, $elapsed);
    }

    public function test_throws_after_exhausting_retries_on_sustained_429(): void
    {
        Http::fake(fn () => Http::response([], 429, ['Retry-After' => '1']));

        $this->expectException(\RuntimeException::class);
        $this->client(maxRetries: 1)->completeJson('s', 'u', 'gemini-2.5-flash');
    }

    public function test_throws_when_gemini_does_not_return_valid_json(): void
    {
        Http::fake(['*generateContent*' => Http::response([
            'candidates' => [['content' => ['parts' => [['text' => 'esto no es JSON']]]]],
        ], 200)]);

        $this->expectException(\RuntimeException::class);
        $this->client()->completeJson('s', 'u', 'gemini-2.5-flash');
    }

    public function test_throws_on_a_non_429_http_failure(): void
    {
        Http::fake(['*generateContent*' => Http::response(['error' => 'boom'], 500)]);

        $this->expectException(\RuntimeException::class);
        $this->client()->completeJson('s', 'u', 'gemini-2.5-flash');
    }
}
