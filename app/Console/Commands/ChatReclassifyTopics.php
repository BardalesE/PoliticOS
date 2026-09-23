<?php

namespace App\Console\Commands;

use App\Models\ChatMessage;
use App\Services\TenantContext;
use App\Services\TopicClassifier;
use Illuminate\Console\Command;

/**
 * Recalcula chat_messages.topic de las respuestas del asistente con
 * TopicClassifier (ver ese servicio para el porqué). El tema se deriva de la
 * PREGUNTA del ciudadano que precede a cada respuesta.
 *
 * Por defecto es un simulacro: muestra la distribución antes/después y no
 * escribe nada. Con --apply guarda. Idempotente.
 *
 * Uso:
 *   php artisan chat:reclassify-topics politicosperu            # simulacro
 *   php artisan chat:reclassify-topics politicosperu --apply
 *   php artisan chat:reclassify-topics --here --days=30 --apply  # BD por defecto
 */
class ChatReclassifyTopics extends Command
{
    protected $signature = 'chat:reclassify-topics
        {slugs?* : Slugs de los tenants}
        {--here : Usar la BD por defecto en vez de un tenant}
        {--days=90 : Solo mensajes de los últimos N días}
        {--apply : Guardar los cambios (sin esto es simulacro)}';

    protected $description = 'Reclasifica el tema de las respuestas del chat para el panel de métricas.';

    public function handle(TopicClassifier $classifier): int
    {
        if ($this->option('here')) {
            $this->process('(BD por defecto)', $classifier);

            return self::SUCCESS;
        }

        $slugs = array_filter((array) $this->argument('slugs'));
        if (! $slugs) {
            $this->error('Indica al menos un slug de tenant, o usa --here.');

            return self::FAILURE;
        }

        foreach ($slugs as $slug) {
            TopicClassifier::flushCache();
            TenantContext::run($slug, fn () => $this->process($slug, $classifier));
        }

        return self::SUCCESS;
    }

    private function process(string $label, TopicClassifier $classifier): void
    {
        $apply = (bool) $this->option('apply');
        $since = now()->subDays(max(1, (int) $this->option('days')));

        $before = [];
        $after = [];
        $changed = 0;
        $state = ['session' => null, 'question' => null, 'previous' => null];

        ChatMessage::query()
            ->where('created_at', '>=', $since)
            ->orderBy('session_id')
            ->orderBy('id')
            ->select(['id', 'session_id', 'role', 'content', 'topic', 'pepa_metadata'])
            ->chunk(500, function ($messages) use ($classifier, $apply, &$before, &$after, &$changed, &$state) {

                foreach ($messages as $m) {
                    if ($m->session_id !== $state['session']) {
                        $state = ['session' => $m->session_id, 'question' => null, 'previous' => null];
                    }

                    if ($m->role === 'user') {
                        $state['question'] = $m->content;
                        continue;
                    }

                    $old = $m->topic ?: '(sin tema)';
                    $new = $state['question'] === null
                        ? null
                        : $classifier->classify($state['question'], $m->pepa_metadata['tema_dominante'] ?? null, $state['previous']);

                    $before[$old] = ($before[$old] ?? 0) + 1;
                    $after[$new ?? '(sin tema)'] = ($after[$new ?? '(sin tema)'] ?? 0) + 1;

                    if ($new !== null) {
                        $state['previous'] = $new;
                    }
                    $state['question'] = null;

                    if ($new !== $m->topic) {
                        $changed++;
                        if ($apply) {
                            ChatMessage::whereKey($m->id)->update(['topic' => $new]);
                        }
                    }
                }
            });

        $this->info("Tenant {$label}: {$changed} respuestas cambian de tema" . ($apply ? ' (guardado).' : ' (simulacro, usa --apply para guardar).'));
        $this->table(['Tema', 'Antes', 'Después'], $this->rows($before, $after));
    }

    private function rows(array $before, array $after): array
    {
        $topics = array_unique(array_merge(array_keys($before), array_keys($after)));
        usort($topics, fn ($a, $b) => ($after[$b] ?? 0) <=> ($after[$a] ?? 0));

        return array_map(fn ($t) => [$t, $before[$t] ?? 0, $after[$t] ?? 0], $topics);
    }
}
