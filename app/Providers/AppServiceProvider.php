<?php

namespace App\Providers;

use App\Services\EmbeddingsServiceInterface;
use App\Services\MySQLFulltextEmbeddings;
use App\Services\QdrantEmbeddings;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Driver de embeddings (swap mysql_fulltext ↔ qdrant vía .env)
        $this->app->bind(EmbeddingsServiceInterface::class, function ($app) {
            $driver = config('services.ai.embeddings_driver', 'mysql_fulltext');
            return match ($driver) {
                'qdrant' => $app->make(QdrantEmbeddings::class),
                default  => $app->make(MySQLFulltextEmbeddings::class),
            };
        });
    }

    public function boot(): void
    {
        //
    }
}
