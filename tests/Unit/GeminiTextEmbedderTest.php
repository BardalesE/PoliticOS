<?php

namespace Tests\Unit;

use App\Services\Embeddings\GeminiTextEmbedder;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GeminiTextEmbedderTest extends TestCase
{
    private function embedder(int $batchSize = 10, int $maxRetries = 5): GeminiTextEmbedder
    {
        return new GeminiTextEmbedder(
            apiKey: 'test-key',
            model: 'gemini-embedding-001',
            dim: 768,
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            batchSize: $batchSize,
            maxRetries: $maxRetries,
        );
    }

    public function test_sends_one_batch_request_and_returns_vectors_in_order(): void
    {
        Http::fake([
            '*batchEmbedContents*' => Http::response([
                'embeddings' => [
                    ['values' => array_fill(0, 768, 0.1)],
                    ['values' => array_fill(0, 768, 0.2)],
                ],
            ], 200),
        ]);

        $out = $this->embedder()->embed(['texto uno', 'texto dos']);

        $this->assertCount(2, $out);
        $this->assertEqualsWithDelta(0.1, $out[0][0], 0.0001);
        $this->assertEqualsWithDelta(0.2, $out[1][0], 0.0001);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'key=test-key')
                && $request['requests'][0]['outputDimensionality'] === 768
                && $request['requests'][0]['content']['parts'][0]['text'] === 'texto uno';
        });
    }

    public function test_splits_into_several_batches_according_to_batch_size(): void
    {
        $calls = 0;
        Http::fake(function ($request) use (&$calls) {
            $calls++;
            $n = count($request->data()['requests']);

            return Http::response(['embeddings' => array_fill(0, $n, ['values' => [1.0]])], 200);
        });

        $this->embedder(batchSize: 2)->embed(['a', 'b', 'c', 'd', 'e']);

        $this->assertSame(3, $calls); // 2+2+1
    }

    public function test_retries_on_429_and_eventually_succeeds(): void
    {
        $attempt = 0;
        Http::fake(function () use (&$attempt) {
            $attempt++;
            if ($attempt < 3) {
                return Http::response([], 429);
            }
            return Http::response(['embeddings' => [['values' => [9.9]]]], 200);
        });

        $out = $this->embedder(maxRetries: 5)->embed(['uno']);

        $this->assertSame(3, $attempt);
        $this->assertEqualsWithDelta(9.9, $out[0][0], 0.0001);
    }

    public function test_throws_after_exhausting_retries_on_sustained_429(): void
    {
        Http::fake(fn () => Http::response([], 429));

        $this->expectException(\Throwable::class);
        $this->embedder(maxRetries: 2)->embed(['uno']);
    }

    public function test_empty_input_returns_empty_without_any_request(): void
    {
        Http::fake();

        $this->assertSame([], $this->embedder()->embed([]));
        Http::assertNothingSent();
    }
}
