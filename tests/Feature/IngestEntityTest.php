<?php

namespace Tests\Feature;

use Tests\TestCase;

class IngestEntityTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.ingest.key' => 'test-key']);
    }

    public function test_rejects_request_without_ingest_key(): void
    {
        $this->getJson('/api/ingest/entities')->assertStatus(401);
    }

    public function test_rejects_request_with_wrong_ingest_key(): void
    {
        $this->getJson('/api/ingest/entities', ['X-Ingest-Key' => 'wrong'])
            ->assertStatus(401);
    }

    public function test_returns_entity_dictionary_with_valid_key(): void
    {
        $response = $this->getJson('/api/ingest/entities', ['X-Ingest-Key' => 'test-key']);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'version',
                'updated_at',
                'candidates' => [['slug', 'name', 'aliases', 'party']],
                'parties'    => [['slug', 'name', 'aliases']],
                'districts'  => [['slug', 'name', 'aliases']],
            ]);

        // 27 circunscripciones oficiales del proceso 2026
        $this->assertCount(27, $response->json('districts'));
    }
}
