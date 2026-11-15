<?php

namespace Tests\Unit;

use App\Jobs\EmbedDocumentSectionsJob;
use App\Jobs\MapDocumentChunkJob;
use App\Jobs\ProcessKnowledgeDocumentJob;
use App\Jobs\ReduceDocumentJob;
use App\Jobs\StartDocumentAnalysisJob;
use Tests\TestCase;

/**
 * config/queue.php: `retry_after` de la cola `database` DEBE ser mayor que el
 * $timeout de CUALQUIER job de ingesta. Si no, el worker puede seguir
 * procesando un job válido (todavía dentro de su $timeout) cuando
 * `retry_after` ya pasó, y Laravel lo vuelve a tomar como si se hubiera
 * perdido — doble ejecución del mismo chunk/documento. Ver el comentario en
 * config/queue.php.
 */
class QueueRetryAfterSafetyTest extends TestCase
{
    private const INGEST_JOBS = [
        ProcessKnowledgeDocumentJob::class,
        StartDocumentAnalysisJob::class,
        MapDocumentChunkJob::class,
        ReduceDocumentJob::class,
        EmbedDocumentSectionsJob::class,
    ];

    public function test_no_ingest_job_timeout_reaches_the_database_queue_retry_after(): void
    {
        $retryAfter = (int) config('queue.connections.database.retry_after');
        $this->assertGreaterThan(0, $retryAfter);

        foreach (self::INGEST_JOBS as $class) {
            $timeout = (new $class(1))->timeout;
            $this->assertLessThan(
                $retryAfter,
                $timeout,
                "{$class}->timeout ({$timeout}s) debe ser MENOR que queue.connections.database.retry_after ({$retryAfter}s), "
                . 'o el worker puede re-tomar el job mientras todavía corre.'
            );
        }
    }
}
