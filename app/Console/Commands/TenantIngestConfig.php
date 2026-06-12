<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

/**
 * Genera el .env de la instancia de ingest de un candidato.
 *
 * Cada candidato corre su propia instancia del servicio Python (ver
 * ingest/docker-compose.instance.yml); este comando escribe la config de esa
 * instancia en ingest/instances/<slug>.env a partir del registro central y
 * de las credenciales compartidas del .env de Laravel.
 *
 * Es regenerable: el provisioning lo invoca con aliases derivados del nombre,
 * y se vuelve a correr a mano cuando los aliases/keywords reales se conozcan.
 * Los archivos generados NO se commitean (contienen INGEST_KEY).
 *
 * Uso:
 *   php artisan tenant:ingest-config camilo \
 *     --aliases="camilo torres,torres" \
 *     --keywords="camilo torres alcalde,elecciones lima 2026"
 */
class TenantIngestConfig extends Command
{
    protected $signature = 'tenant:ingest-config
        {slug : Slug del tenant (debe existir en el registro)}
        {--aliases= : Aliases del candidato separados por coma (default: derivados del nombre)}
        {--keywords= : Keywords de búsqueda para Twitter/YouTube separados por coma}
        {--youtube-channels= : IDs de canales de YouTube separados por coma}
        {--api-url= : URL de la API Laravel vista desde el contenedor}
        {--force : Sobrescribir sin confirmar si el archivo ya existe}';

    protected $description = 'Genera ingest/instances/<slug>.env para la instancia de ingest del candidato.';

    private const RSS_FEEDS_DEFAULT = 'https://rpp.pe/rss/peru.xml,https://elcomercio.pe/feed/politica,https://larepublica.pe/rss,https://gestion.pe/feed/';

    public function handle(): int
    {
        $slug = strtolower(trim($this->argument('slug')));

        $tenant = Tenant::where('slug', $slug)->first();
        if (!$tenant) {
            $this->error("No existe un tenant con slug '{$slug}'. Provisiónalo primero con tenant:provision.");
            return 1;
        }

        $ingestKey = config('services.ingest.key');
        if (!$ingestKey) {
            $this->error('INGEST_KEY no está definida en el .env de Laravel — la instancia no podría autenticarse.');
            return 1;
        }

        $path = base_path("ingest/instances/{$slug}.env");

        if (File::exists($path) && !$this->option('force') && $this->input->isInteractive()) {
            if (!$this->confirm("ingest/instances/{$slug}.env ya existe. ¿Sobrescribir?")) {
                $this->info('Cancelado.');
                return 0;
            }
        }

        $aliases  = $this->option('aliases') ?: $this->defaultAliases($tenant->name);
        $keywords = $this->option('keywords') ?: '';
        $channels = $this->option('youtube-channels') ?: '';
        $apiUrl   = $this->option('api-url') ?: $this->defaultApiUrl();

        File::ensureDirectoryExists(dirname($path));
        File::put($path, $this->renderEnv($slug, $aliases, $keywords, $channels, $apiUrl, $ingestKey));

        $this->line("<fg=green>✓</> Config de ingest escrita en <fg=yellow>ingest/instances/{$slug}.env</>");
        if (!$this->option('aliases')) {
            $this->warn("  Aliases derivados del nombre del tenant: \"{$aliases}\" — afínalos y regenera con --aliases.");
        }
        $this->line('');
        $this->line('Para levantar la instancia:');
        $this->line("  <fg=cyan>cd ingest && docker compose -f docker-compose.instance.yml -p ingest-{$slug} --env-file instances/{$slug}.env up -d</>");

        return 0;
    }

    /** "Campaña Camilo Torres" → "campaña camilo torres,camilo torres,torres" (sin duplicados). */
    private function defaultAliases(string $tenantName): string
    {
        $full  = mb_strtolower(trim($tenantName));
        $clean = trim(preg_replace('/^(campaña|campana)\s+/u', '', $full));
        $words = preg_split('/\s+/', $clean);

        $aliases = array_unique(array_filter([
            $full,
            $clean,
            count($words) > 1 ? end($words) : null, // apellido
        ]));

        return implode(',', $aliases);
    }

    private function defaultApiUrl(): string
    {
        $appUrl = rtrim(config('app.url', 'http://localhost'), '/');

        // En dev el contenedor llega al host vía host.docker.internal (el
        // compose de instancia mapea host-gateway); en producción usa APP_URL.
        if (str_contains($appUrl, 'localhost') || str_contains($appUrl, '127.0.0.1')) {
            return 'http://host.docker.internal:8000/api';
        }

        return "{$appUrl}/api";
    }

    private function renderEnv(
        string $slug,
        string $aliases,
        string $keywords,
        string $channels,
        string $apiUrl,
        string $ingestKey,
    ): string {
        $groqKey    = config('services.ai.groq_key') ?? '';
        $groqModel  = 'llama-3.1-8b-instant'; // clasificación rápida, no el modelo del chat
        $openaiKey  = config('services.ai.openai_key') ?? '';
        $embedModel = config('services.ai.embeddings_model', 'text-embedding-3-small');
        $qdrantKey  = config('services.qdrant.api_key') ?? '';
        $rssFeeds   = self::RSS_FEEDS_DEFAULT;
        $generated  = now()->toDateTimeString();

        return <<<ENV
# ══════════════════════════════════════════════════════════════════
# Instancia de ingest del candidato: {$slug}
# Generado: {$generated} por `php artisan tenant:ingest-config {$slug}`
# Regenerar tras cambiar aliases/keywords. NO COMMITEAR (contiene INGEST_KEY).
# ══════════════════════════════════════════════════════════════════

# ── Tenant ──────────────────────────────────────────────────────
TENANT_SLUG={$slug}

# ── Laravel API ─────────────────────────────────────────────────
LARAVEL_API_URL={$apiUrl}
INGEST_KEY={$ingestKey}

# ── Candidato a monitorear ──────────────────────────────────────
# Aliases que el clasificador busca en los textos scrapeados
TARGET_ALIASES={$aliases}
# Keywords de búsqueda (Twitter / YouTube)
TARGET_KEYWORDS={$keywords}
YOUTUBE_CHANNELS={$channels}

# ── Fuentes RSS (medios nacionales por defecto) ─────────────────
RSS_FEEDS={$rssFeeds}

# ── Credenciales compartidas ────────────────────────────────────
GROQ_API_KEY={$groqKey}
GROQ_MODEL={$groqModel}
YOUTUBE_API_KEY=
TWITTER_BEARER_TOKEN=
OPENAI_API_KEY={$openaiKey}
EMBEDDINGS_MODEL={$embedModel}

# ── Infra (resuelta por docker-compose.instance.yml) ────────────
# redis = broker Celery propio de ESTA instancia; qdrant = compartido
REDIS_URL=redis://redis:6379
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY={$qdrantKey}

ENV;
    }
}
