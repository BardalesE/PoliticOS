<?php

namespace Tests\Unit;

use App\Services\Embeddings\CosineSimilarity;
use Tests\TestCase;

class CosineSimilarityTest extends TestCase
{
    public function test_pack_and_unpack_roundtrip_preserves_values(): void
    {
        $vector = [0.1, -0.5, 3.25, 0.0, 1.0];

        $blob     = CosineSimilarity::pack($vector);
        $restored = CosineSimilarity::unpack($blob);

        $this->assertCount(count($vector), $restored);
        foreach ($vector as $i => $v) {
            $this->assertEqualsWithDelta($v, $restored[$i], 0.0001);
        }
    }

    public function test_identical_vectors_have_similarity_one(): void
    {
        $v = [1.0, 2.0, 3.0];
        $this->assertEqualsWithDelta(1.0, CosineSimilarity::similarity($v, $v), 0.0001);
    }

    public function test_orthogonal_vectors_have_similarity_zero(): void
    {
        $this->assertEqualsWithDelta(0.0, CosineSimilarity::similarity([1, 0], [0, 1]), 0.0001);
    }

    public function test_opposite_vectors_have_similarity_minus_one(): void
    {
        $this->assertEqualsWithDelta(-1.0, CosineSimilarity::similarity([1, 0], [-1, 0]), 0.0001);
    }

    public function test_zero_vector_yields_zero_instead_of_division_by_zero(): void
    {
        $this->assertSame(0.0, CosineSimilarity::similarity([0, 0], [1, 1]));
    }
}
