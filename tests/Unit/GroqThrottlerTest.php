<?php

namespace Tests\Unit;

use App\Services\Llm\GroqThrottler;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * MapDocumentChunkJob confía en esto para no disparar decenas de requests en
 * paralelo contra el plan gratuito de Groq (429 en bloque).
 */
class GroqThrottlerTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.default' => 'array']);
        Cache::flush();
    }

    public function test_allows_requests_within_budget(): void
    {
        $t = new GroqThrottler(5, 10000);

        $r = $t->tryAcquire('doc:1', 1000);

        $this->assertTrue($r['allowed']);
    }

    public function test_blocks_once_requests_per_minute_is_exhausted(): void
    {
        $t = new GroqThrottler(2, 100000);

        $this->assertTrue($t->tryAcquire('doc:2', 100)['allowed']);
        $this->assertTrue($t->tryAcquire('doc:2', 100)['allowed']);
        $r = $t->tryAcquire('doc:2', 100);

        $this->assertFalse($r['allowed']);
        $this->assertGreaterThan(0, $r['retry_after']);
    }

    public function test_blocks_once_tokens_per_minute_budget_is_exhausted(): void
    {
        $t = new GroqThrottler(100, 1000);

        $this->assertTrue($t->tryAcquire('doc:3', 600)['allowed']);
        $r = $t->tryAcquire('doc:3', 600);

        $this->assertFalse($r['allowed']);
    }

    public function test_different_keys_do_not_share_budget(): void
    {
        $t = new GroqThrottler(1, 100000);

        $this->assertTrue($t->tryAcquire('doc:a', 10)['allowed']);
        $this->assertTrue($t->tryAcquire('doc:b', 10)['allowed']);
    }
}
