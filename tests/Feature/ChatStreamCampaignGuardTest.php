<?php

namespace Tests\Feature;

use App\Models\AiSetting;
use App\Models\CandidateProfile;
use App\Models\ChatSession;
use App\Services\CivicAIService;
use App\Services\EmbeddingsServiceInterface;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

/**
 * E2E de respondStream() en modo campaña: se sustituye SOLO la capa de red
 * (callAIStream, protected) por un mock que emite chunks predefinidos como
 * llegarían de Groq, y opcionalmente el driver de RAG; todo lo demás
 * (buildContext, parseAIResponse, el guard de fuga de contexto crudo) corre
 * de verdad.
 *
 * Cubre la regresión detectada en la review de e3f0cd6: bufferizar el arranque
 * antes de emitir mataba el "escribiendo en vivo" de toda respuesta corta.
 */
class ChatStreamCampaignGuardTest extends TestCase
{
    use DatabaseTransactions;

    private function makeCampaignSession(): ChatSession
    {
        CandidateProfile::create([
            'name'      => 'Candidato de Prueba',
            'title'     => 'Alcalde',
            'location'  => 'Distrito de Prueba',
            'party'     => 'Partido de Prueba',
            'is_active' => true,
        ]);

        AiSetting::current()->update([
            'provider'      => 'groq',
            'system_prompt' => 'Eres un asistente de prueba.',
            'mode'          => 'campaign',
        ]);

        return ChatSession::create([
            'session_id' => 'test-'.uniqid(),
            'started_at' => now(),
        ]);
    }

    /** RAG fake que devuelve un único doc con el excerpt dado (o ninguno). */
    private function fakeEmbeddings(?string $excerpt): EmbeddingsServiceInterface
    {
        return new class($excerpt) implements EmbeddingsServiceInterface {
            public function __construct(private ?string $excerpt) {}
            public function index(int $documentId, string $content, array $metadata = []): void {}
            public function search(string $query, int $topK = 5, array $filter = []): array
            {
                if ($this->excerpt === null) return [];
                return [[
                    'document_id' => 1,
                    'title'       => 'Plan de seguridad ciudadana',
                    'excerpt'     => $this->excerpt,
                    'score'       => 1.0,
                    'metadata'    => [
                        'source_url' => 'https://example.test/plan.pdf', 'file_url' => null,
                        'candidate_id' => null, 'source_type' => 'pdf', 'topic' => null,
                    ],
                ]];
            }
            public function delete(int $documentId): void {}
        };
    }

    /** CivicAIService con la capa de red (callAIStream) sustituida por chunks fijos. */
    private function fakeService(array $chunks, ?EmbeddingsServiceInterface $embeddings = null): CivicAIService
    {
        $svc = new class($embeddings ?? app(EmbeddingsServiceInterface::class)) extends CivicAIService {
            public array $streamChunks = [];

            protected function callAIStream(string $userMessage, string $context, array $history,
                                            array $segment, ?array $attack, ChatSession $session,
                                            ?string $topic, callable $onChunk): void
            {
                foreach ($this->streamChunks as $c) {
                    $onChunk($c);
                }
            }
        };
        $svc->streamChunks = $chunks;

        return $svc;
    }

    public function test_respuesta_corta_de_campana_se_streamea_progresivamente(): void
    {
        $chunks = [
            'Hola paisano, ', '¿de qué ', 'distrito ', 'eres y qué ', 'problema ',
            'te preocupa ', 'más en tu ', 'comunidad? ', 'Cuéntame y ', 'te ayudo con eso.',
        ];
        $full = implode('', $chunks);
        $this->assertLessThan(300, mb_strlen($full), 'la respuesta debe estar bajo el umbral que causaba el bug');

        $session = $this->makeCampaignSession();
        $svc = $this->fakeService($chunks);

        $emitted = [];
        $svc->respondStream('hola', $session, function (string $c) use (&$emitted) {
            $emitted[] = $c;
        });

        // Progresivo: NO una sola llamada con todo el texto de golpe.
        $this->assertGreaterThan(1, count($emitted), 'la respuesta corta debe llegar en varias llamadas a onChunk, no en un solo bloque');
        $this->assertSame($chunks, $emitted, 'cada chunk se emite tal como llega, en orden');
        $this->assertSame($full, implode('', $emitted));
    }

    public function test_respuesta_larga_normal_se_streamea_progresivamente(): void
    {
        // > 300 chars, sin relación con el contexto (RAG vacío) → no es fuga.
        $chunks = array_fill(0, 20, 'oracion natural distinta numero N con contenido util. ');
        $session = $this->makeCampaignSession();
        $svc = $this->fakeService($chunks, $this->fakeEmbeddings(null));

        $emitted = [];
        $meta = $svc->respondStream('hola, algo largo', $session, function (string $c) use (&$emitted) {
            $emitted[] = $c;
        });

        $this->assertSame($chunks, $emitted, 'passthrough progresivo, sin retención');
        $this->assertNotSame(CivicAIService::TECH_DIFFICULTY_REPLY, end($emitted));
        $this->assertFalse($meta['ai_resting'] ?? false);
    }

    public function test_volcado_de_contexto_a_media_stream_corta_y_agrega_canned(): void
    {
        $dump = 'El programa integral de seguridad ciudadana contempla la instalacion de '
            . 'doce bases de serenazgo interconectadas con un sistema central de '
            . 'videovigilancia con analitica de video en tiempo real, la incorporacion de '
            . 'ciento veinte nuevos efectivos y un presupuesto plurianual de ocho millones '
            . 'y medio de soles ejecutable en treinta meses con auditoria trimestral.';

        $session = $this->makeCampaignSession();

        // El "modelo" vuelca el excerpt verbatim, en chunks de 40 chars; el RAG
        // fake devuelve ese mismo excerpt como contexto.
        $chunks = mb_str_split($dump, 40);
        $svc = $this->fakeService($chunks, $this->fakeEmbeddings($dump));

        $emitted = [];
        $meta = $svc->respondStream(
            'que propones sobre serenazgo y videovigilancia',
            $session,
            function (string $c) use (&$emitted) { $emitted[] = $c; }
        );

        $this->assertNotEmpty($emitted);
        $this->assertSame(CivicAIService::TECH_DIFFICULTY_REPLY, end($emitted), 'el stream cortado termina con el mensaje canned');
        $this->assertLessThan(count($chunks), count($emitted), 'el stream se cortó antes de volcar todo el documento');
        $this->assertTrue($meta['ai_resting'] ?? false, 'la respuesta queda marcada como fallback');

        // Trade-off consciente: el ciudadano pudo ver algo de fuga, pero acotado.
        $leaked = implode('', array_slice($emitted, 0, -1));
        $this->assertLessThanOrEqual(360, mb_strlen($leaked), 'la fuga visible antes del corte queda acotada');
    }
}
